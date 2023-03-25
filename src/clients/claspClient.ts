import * as childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'fs/promises';
import { google } from 'googleapis';
import { homedir } from 'os';
import { Uri } from 'vscode';

const exec = promisify(childProcess.exec);

export interface GoogleAppsScriptClient {
  downloadProject(project: Project, path: Uri): Promise<string>;
  getDeployments(projectId: string): Promise<Deployment[]>;
  getProjects(): Promise<Project[]>;
}

export interface Project {
  name: string;
  id: string;
  url: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  description: string | undefined;
  versionNumber: number | undefined;
  versionIdentity: string;
}

export class ClaspGoogleAppsScriptClient implements GoogleAppsScriptClient {
  constructor(private claspPath: string) {}

  async setupAuth() {
    const buffer = await readFile(`${homedir()}/.clasprc.json`);
    const json = JSON.parse(buffer.toString());
    const oauth2Client = new google.auth.OAuth2(json.oauth2ClientSettings);
    oauth2Client.setCredentials(json.token);
    google.options({ auth: oauth2Client });
  }

  async downloadProject(project: Project, destination: Uri): Promise<string> {
    const dir = `${destination.fsPath}/${project.name}`;
    await mkdir(dir);
    await exec(`${this.claspPath} clone ${project.id} --rootDir '${dir}'`);
    return dir;
  }

  async getProjects(): Promise<Project[]> {
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

  async getDeployments(projectId: string): Promise<Deployment[]> {
    const script = google.script('v1');
    const list = await script.projects.deployments.list({
      scriptId: projectId,
    });
    return (list.data.deployments || []).map((deployment) => ({
      id: deployment.deploymentId!,
      projectId: deployment.deploymentConfig?.scriptId!,
      description: deployment.deploymentConfig?.description || undefined,
      versionNumber: deployment.deploymentConfig?.versionNumber || undefined,
      versionIdentity: `@${
        deployment.deploymentConfig?.versionNumber?.toString() || 'HEAD'
      }`,
    }));
  }
}
