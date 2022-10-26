import { QuickInputButtons, QuickPickItem, window } from 'vscode';

interface ExtendedQuickPickOption {
  step?: number;
  totalSteps?: number;
  title?: string;
}

export async function showExtendedQuickPick(
  items: QuickPickItem[],
  option: ExtendedQuickPickOption
) {
  const pick = window.createQuickPick();
  pick.items = items;
  pick.title = option.title;
  pick.step = option.step;
  pick.totalSteps = option.totalSteps;
  pick.buttons = [QuickInputButtons.Back];

  return await new Promise<QuickPickItem | undefined>((resolve) => {
    pick.onDidAccept(() => {
      pick.hide();
      resolve(pick.selectedItems[0]);
    });
    pick.onDidTriggerButton((button) => {
      if (button === QuickInputButtons.Back) {
        pick.hide();
      }
    });
    pick.onDidHide(() => resolve(undefined));
    pick.show();
  });
}
