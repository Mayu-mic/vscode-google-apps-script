// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ClaspGoogleAppsScriptClient } from './client';
import { detectRuntimePath } from './util/detect-runtime-path';
import {
  DeploymentItem,
  ProjectItem,
  ProjectsViewProvider,
} from './view/projects-view';

let storageUri: vscode.Uri | undefined = undefined;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "vscode-google-apps-script" is now active!'
  );

  storageUri = context.globalStorageUri;
  await createStorageDirectory(storageUri);

  const claspPath = await detectRuntimePath('clasp', storageUri);
  if (!claspPath) {
    vscode.window
      .showErrorMessage(
        `claspがグローバルにインストールされていません。`,
        'Githubを開く'
      )
      .then((button) => {
        if (button === 'Githubを開く') {
          vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/google/clasp')
          );
        }
      });
    return;
  }

  const claspClient = new ClaspGoogleAppsScriptClient(claspPath);
  try {
    await claspClient.setupAuth();
  } catch (error) {
    vscode.window.showErrorMessage(
      'claspの認証に失敗しました。`clasp login` を試してください。'
    );
    return;
  }

  const projectsView = new ProjectsViewProvider(claspClient);

  const disposables = [
    vscode.commands.registerCommand(
      'vscode-google-apps-script.refreshProjects',
      () => projectsView.refresh()
    ),
    vscode.commands.registerCommand(
      'vscode-google-apps-script.downloadProject',
      (item: ProjectItem) => projectsView.downloadProject(item)
    ),
    vscode.commands.registerCommand(
      'vscode-google-apps-script.copyProjectId',
      (item: ProjectItem) => projectsView.copyProjectId(item)
    ),
    vscode.commands.registerCommand(
      'vscode-google-apps-script.openProjectUri',
      (item: ProjectItem) => projectsView.openProjectUri(item)
    ),
    vscode.commands.registerCommand(
      'vscode-google-apps-script.copyDeploymentId',
      (item: DeploymentItem) => projectsView.copyDeploymentId(item)
    ),
    vscode.commands.registerCommand(
      'vscode-google-apps-script.copyLibraryReference',
      (item: DeploymentItem) => projectsView.copyLibraryReference(item)
    ),
    vscode.window.registerTreeDataProvider('projects-view', projectsView),
  ];

  disposables.forEach((disposable) => context.subscriptions.push(disposable));
}

// this method is called when your extension is deactivated
export async function deactivate() {
  if (storageUri) {
    await deleteStorageDirectory(storageUri);
  }
}

async function createStorageDirectory(storageUri: vscode.Uri) {
  await vscode.workspace.fs.createDirectory(storageUri);
}

async function deleteStorageDirectory(storageUri: vscode.Uri) {
  await vscode.workspace.fs.delete(storageUri, { recursive: true });
}
