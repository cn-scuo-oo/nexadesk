function SettingsModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="应用设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="settings-modal-close icon-button" onClick={onClose} type="button" aria-label="关闭设置">
          <X size={17} />
        </button>
        {children}
      </section>
    </div>
  );
}