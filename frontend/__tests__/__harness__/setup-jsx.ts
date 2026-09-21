//extend expect with dom matchers
import "@testing-library/jest-dom";

// jsdom ships no dialog methods, and every modal opens through them
const dialog = HTMLDialogElement.prototype;
if (typeof dialog.showModal !== "function") {
  dialog.showModal = function (this: HTMLDialogElement): void {
    this.open = true;
  };
  dialog.show = function (this: HTMLDialogElement): void {
    this.open = true;
  };
  dialog.close = function (this: HTMLDialogElement): void {
    this.open = false;
  };
}
