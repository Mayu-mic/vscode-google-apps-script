import {
  Event,
  EventEmitter,
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
} from 'vscode';
import { showExtendedQuickPick } from '../ui/showExtendedQuickPick';
import { GoogleAppsScriptClient } from '../clients/claspClient';
import {
  GoogleAppsScriptDeployment,
  GoogleAppsScriptProject,
  GoogleAppsScriptVersion,
  isHeadDeployment,
} from '../domain/googleAppsScript';

interface LibraryReference {
  libraryId: string;
  developmentMode: boolean;
  version: string;
  userSymbol: string;
}

export class ProjectsViewProvider
  implements TreeDataProvider<DependencyElement>
{
  constructor(private client: GoogleAppsScriptClient) {}

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

  copyLibraryReference(item: DeploymentItem | VersionItem): void {
    const userSymbol = item.project.name
      .replace(/^\d+/, '')
      .replace(/[-@\s]/g, '');

    const reference: LibraryReference =
      item instanceof DeploymentItem
        ? {
            libraryId: item.project.id,
            developmentMode: isHeadDeployment(item.deployment),
            version: isHeadDeployment(item.deployment)
              ? '0'
              : item.deployment.versionNumber.toString(),
            userSymbol,
          }
        : {
            libraryId: item.project.id,
            developmentMode: false,
            version: item.version.versionNumber.toString(),
            userSymbol,
          };
    env.clipboard.writeText(JSON.stringify(reference, null, 2));
    window.showInformationMessage('ライブラリ参照をコピーしました。');
  }

  getTreeItem(element: DependencyElement): TreeItem | Thenable<TreeItem> {
    return element;
  }

  async getChildren(
    element?: DependencyElement | undefined
  ): Promise<DependencyElement[]> {
    if (element instanceof ProjectItem) {
      const allVersions = await this.client.getVersions(element.id!);
      const deployments = await this.client.getDeployments(element.id!);
      const deployedVersionNumbers = deployments.flatMap((d) =>
        isHeadDeployment(d) ? [] : [d.versionNumber]
      );
      const notDeployedVersions = allVersions.filter(
        (version) => !deployedVersionNumbers.includes(version.versionNumber)
      );
      return deployments.map((deployment) => {
        if (isHeadDeployment(deployment)) {
          return new DeploymentItem(
            element.project,
            deployment,
            notDeployedVersions,
            notDeployedVersions.length > 0
              ? TreeItemCollapsibleState.Expanded
              : TreeItemCollapsibleState.None
          );
        } else {
          return new DeploymentItem(
            element.project,
            deployment,
            [],
            TreeItemCollapsibleState.None
          );
        }
      });
    } else if (element instanceof DeploymentItem) {
      return element.versions.map(
        (version) =>
          new VersionItem(
            element.project,
            version,
            TreeItemCollapsibleState.None
          )
      );
    } else {
      const projects = await this.client.getProjects();
      return projects.map(
        (project) =>
          new ProjectItem(project, TreeItemCollapsibleState.Collapsed)
      );
    }
  }
}

abstract class DependencyElement extends TreeItem {}

export class ProjectItem extends DependencyElement {
  constructor(
    public readonly project: GoogleAppsScriptProject,
    public collapsibleState: TreeItemCollapsibleState
  ) {
    super(project.name, collapsibleState);
    this.contextValue = 'project';
    this.id = project.id;
    this.tooltip = project.name;
  }
}

export class DeploymentItem extends DependencyElement {
  constructor(
    public readonly project: GoogleAppsScriptProject,
    public readonly deployment: GoogleAppsScriptDeployment,
    public readonly versions: GoogleAppsScriptVersion[],
    public collapsibleState: TreeItemCollapsibleState
  ) {
    super(deployment.versionIdentity, collapsibleState);
    this.contextValue = 'deployment';
    this.id = deployment.id;
    this.description = 'description' in deployment && deployment.description;
    this.tooltip = deployment.versionIdentity;
  }
}

export class VersionItem extends DependencyElement {
  constructor(
    public readonly project: GoogleAppsScriptProject,
    public readonly version: GoogleAppsScriptVersion,
    public collapsibleState: TreeItemCollapsibleState
  ) {
    super(`v${version.versionNumber}`, collapsibleState);
    this.contextValue = 'version';
    this.id = version.versionNumber.toString();
    this.description = version.description;
    this.tooltip = `Version ${version.versionNumber}`;
  }
}
