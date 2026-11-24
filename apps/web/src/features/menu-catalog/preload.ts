export function loadItemCustomizerModal() {
  return import('./components/ItemCustomizerModal');
}

export function preloadItemCustomizerModal(): void {
  void loadItemCustomizerModal();
}
