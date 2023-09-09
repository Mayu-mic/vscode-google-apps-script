import * as childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'fs/promises';
import { google, script_v1 } from 'googleapis';
import { homedir } from 'os';
import { Uri } from 'vscode';
import {
  GoogleAppsScriptDeployment,
  GoogleAppsScriptProject,
  GoogleAppsScriptVersion,
} from '../domain/googleAppsScript';

const exec = promisify(childProcess.exec);

export interface GoogleAppsScriptClient {
  downloadProject(project: GoogleAppsScriptProject, path: Uri): Promise<string>;
  getProjects(): Promise<GoogleAppsScriptProject[]>;
  getDeployments(projectId: string): Promise<GoogleAppsScriptDeployment[]>;
  getVersions(projectId: string): Promise<GoogleAppsScriptVersion[]>;
}

export class ClaspGoogleAppsScriptClient implements GoogleAppsScriptClient {
  private constructor(private claspPath: string) {}

  async downloadProject(
    project: GoogleAppsScriptProject,
    destination: Uri
  ): Promise<string> {
    const dir = `${destination.fsPath}/${project.name}`;
    await mkdir(dir);
    await exec(`${this.claspPath} clone ${project.id} --rootDir '${dir}'`);
    return dir;
  }

  async getProjects(): Promise<GoogleAppsScriptProject[]> {
    const drive = google.drive('v3');
    const {
      data: { files = [] },
      status,
    } = await drive.files.list({
      pageSize: 50,
      q: 'mimeType="application/vnd.google-apps.script" and trashed=false',
    });

    if (status !== 200) {
      throw new Error(`Error fetching projects: ${status}`);
    }

    return files.map((file) => ({
      id: file.id!,
      name: file.name!,
      url: `https://script.google.com/d/${file.id}/edit`,
    }));
  }

  async getDeployments(
    projectId: string
  ): Promise<GoogleAppsScriptDeployment[]> {
    const script = google.script('v1');

    let nextPageToken: string | undefined;
    let deployments: script_v1.Schema$Deployment[] = [];

    do {
      const params: script_v1.Params$Resource$Projects$Deployments$List = {
        scriptId: projectId,
      };
      if (nextPageToken) {
        params['pageToken'] = nextPageToken;
      }
      const list = await script.projects.deployments.list(params);
      deployments = deployments.concat(list.data.deployments || []);
      nextPageToken = list.data.nextPageToken ?? undefined;
    } while (nextPageToken);

    return deployments.map((deployment) => {
      const versionNumber = deployment.deploymentConfig?.versionNumber;
      if (!versionNumber) {
        return {
          id: deployment.deploymentId!,
          projectId: deployment.deploymentConfig?.scriptId!,
          versionIdentity: '@HEAD',
        };
      } else {
        return {
          id: deployment.deploymentId!,
          projectId: deployment.deploymentConfig?.scriptId!,
          description: deployment.deploymentConfig?.description || undefined,
          versionIdentity: `@${versionNumber.toString()}`,
          versionNumber,
        };
      }
    });
  }

  async getVersions(projectId: string): Promise<GoogleAppsScriptVersion[]> {
    const script = google.script('v1');

    let nextPageToken: string | undefined;
    let versions: script_v1.Schema$Version[] = [];
    let previousMinimumVersionNumber = -1;

    while (true) {
      const params: script_v1.Params$Resource$Projects$Deployments$List = {
        scriptId: projectId,
      };
      if (nextPageToken) {
        params['pageToken'] = nextPageToken;
      }
      const list = await script.projects.versions.list(params);
      if (list.data.versions) {
        const versionNumbers = list.data.versions.map(
          (version) => version.versionNumber!
        );
        const currentMinimumVersionNumber = Math.min(...versionNumbers);
        if (currentMinimumVersionNumber === previousMinimumVersionNumber) {
          break;
        }
        versions = versions.concat(list.data.versions || []);
        previousMinimumVersionNumber = currentMinimumVersionNumber;
      } else {
        break;
      }
    }

    return versions.map((version) => ({
      projectId,
      versionNumber: version.versionNumber!,
      description: version.description || undefined,
    }));
  }

  static async setupFromPath(
    claspPath: string
  ): Promise<ClaspGoogleAppsScriptClient> {
    const buffer = await readFile(`${homedir()}/.clasprc.json`);
    const json = JSON.parse(buffer.toString());
    const oauth2Client = new google.auth.OAuth2(json.oauth2ClientSettings);
    oauth2Client.setCredentials(json.token);
    google.options({ auth: oauth2Client });

    return new ClaspGoogleAppsScriptClient(claspPath);
  }
}
