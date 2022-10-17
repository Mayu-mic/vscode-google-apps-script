import {
  Event,
  EventEmitter,
  ProviderResult,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  env,
  window,
  Uri,
  ProgressLocation,
  commands,
  workspace,
  QuickPickItem,
  QuickPickItemKind,
  QuickInputButtons,
} from 'vscode';
import * as fs from 'fs';
import { showExtendedQuickPick } from '../ui/showExtendedQuickPick';
import { Deployment, IGoogleAppsScriptClient, Project } from '../claspClient';

export class ProjectsViewProvider
  implements TreeDataProvider<DependencyElement>
{
  constructor(private client: IGoogleAppsScriptClient) {}

  private _onDidChangeTreeData: EventEmitter<
    void | DependencyElement | DependencyElement[] | null | undefined
  > = new EventEmitter();
  onDidChangeTreeData?: Event<
    void | DependencyElement | DependencyElement[] | null | undefined
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async downloadProject(item: ProjectItem): Promise<void> {
    const items: QuickPickItem[] = [];
    const workspaceFolders = workspace.workspaceFolders;
    const selectFolderLabel = '$(folder) フォルダを選択します...';
    if (workspaceFolders) {
      workspaceFolders.forEach((folder) => {
        items.push({
          label: `$(root-folder) ${folder.name}`,
        });
      });
    }
    items.push({
      label: selectFolderLabel,
      detail: '選択されたフォルダにプロジェクトをダウンロードします。',
    });
    const selectDownloadDir = await showExtendedQuickPick(items, {
      step: 1,
      totalSteps: 1,
      title: 'ダウンロード先を選択してください',
    });
    if (!selectDownloadDir) {
      return;
    }
    let downloadDir: Uri;
    if (selectDownloadDir.label === selectFolderLabel) {
      const pickedFolder = await window.showOpenDialog({
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'ダウンロード先を選択',
      });
      if (!pickedFolder) {
        return;
      }
      downloadDir = pickedFolder[0];
    } else {
      const selectedFolder = workspaceFolders!.find(
        (folder) =>
          folder.name === selectDownloadDir.label.replace('$(root-folder) ', '')
      );
      downloadDir = selectedFolder!.uri;
    }

    let projectDir: string;
    await window
      .withProgress(
        {
          title: 'ダウンロード中',
          location: ProgressLocation.Notification,
        },
        async () => {
          projectDir = await this.client.downloadProject(
            item.project,
            downloadDir
          );
        }
      )
      .then(
        async () => {
          const result = await window.showInformationMessage(
            'ダウンロードが完了しました。開きますか？',
            'Open with code'
          );
          if (result === 'Open with code') {
            commands.executeCommand(
              'vscode.openFolder',
              Uri.file(projectDir),
              true
            );
          }
        },
        (error) => {
          console.log(error);
          window.showErrorMessage('ダウンロードに失敗しました。');
        }
      );
  }

  copyProjectId(item: ProjectItem): void {
    env.clipboard.writeText(item.project.id);
    window.showInformationMessage('Project IDをコピーしました。');
  }

  openProjectUri(item: ProjectItem): void {
    env.openExternal(Uri.parse(item.project.url));
  }

  copyDeploymentId(item: DeploymentItem): void {
    env.clipboard.writeText(item.deployment.id);
    window.showInformationMessage('Deployment IDをコピーしました。');
  }

  copyLibraryReference(item: DeploymentItem): void {
    const userSymbol = item.project.name
      .replace(/^\d+/, '')
      .replace(/[-@\s]/g, '');
    const reference = {
      libraryId: item.projectId,
      developmentMode: item.deployment.versionNumber === undefined,
      version: item.deployment.versionNumber?.toString() ?? '0',
      userSymbol,
    };
    env.clipboard.writeText(JSON.stringify(reference, null, 2));
    window.showInformationMessage('ライブラリ参照をコピーしました。');
  }

  getTreeItem(element: DependencyElement): TreeItem | Thenable<TreeItem> {
    return element;
  }

  getChildren(
    element?: DependencyElement | undefined
  ): ProviderResult<DependencyElement[]> {
    if (element instanceof ProjectItem) {
      const project = element.project;
      return this.client
        .getDeployments(element.id!)
        .then((deployments) =>
          deployments.map(
            (deployment) =>
              new DeploymentItem(
                deployment,
                project,
                TreeItemCollapsibleState.None
              )
          )
        );
    } else {
      return this.client
        .getProjects()
        .then((projects) =>
          projects.map(
            (project) =>
              new ProjectItem(project, TreeItemCollapsibleState.Collapsed)
          )
        );
    }
  }
}

abstract class DependencyElement extends TreeItem {}

export class ProjectItem extends DependencyElement {
  constructor(
    public readonly project: Project,
    public collapsibleState: TreeItemCollapsibleState
  ) {
    super(project.name, collapsibleState);
    this.contextValue = 'project';
    this.id = project.id;
    this.tooltip = project.name;
  }
}

export class DeploymentItem extends DependencyElement {
  readonly projectId: string;

  constructor(
    public readonly deployment: Deployment,
    public readonly project: Project,
    public collapsibleState: TreeItemCollapsibleState
  ) {
    super(deployment.versionIdentity, collapsibleState);
    this.contextValue = 'deployment';
    this.id = deployment.id;
    this.projectId = deployment.projectId;
    this.description = deployment.description;
    this.tooltip = deployment.versionIdentity;
  }
}
