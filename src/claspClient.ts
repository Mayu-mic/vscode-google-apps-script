import * as childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'fs/promises';
import { google } from 'googleapis';
import { homedir } from 'os';
import { Uri } from 'vscode';

const exec = promisify(childProcess.exec);

export interface IGoogleAppsScriptClient {
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

export class ClaspGoogleAppsScriptClient implements IGoogleAppsScriptClient {
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
    const output = (await exec(`${this.claspPath} list --noShorten`)).stdout;
    const lines = output.split('\n');
    const projects: Project[] = [];
    lines.forEach((line) => {
      const [name, url] = line.split(' - ');
      if (name && url) {
        const id = ClaspGoogleAppsScriptClient.getIdFromUrl(url);
        if (id) {
          projects.push({ name, id, url });
        }
      }
    });
    return projects;
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

  private static getIdFromUrl(url: string): string | undefined {
    const matches = url.match(
      /https?:\/\/script\.google\.com\/d\/([^\/]+)\/edit/
    );
    if (matches && matches[1]) {
      return matches[1];
    }
  }
}
