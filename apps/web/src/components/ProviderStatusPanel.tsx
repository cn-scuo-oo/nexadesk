function ProviderStatusPanel({
  providers,
  onOpenSettings
}: {
  providers: ProviderSettings[];
  onOpenSettings: () => void;
}) {
  return (
    <section className="panel-block" id="providers">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">模型层</p>
          <h3>当前模型服务</h3>
        </div>
        <button className="icon-button" onClick={onOpenSettings} type="button" aria-label="Open settings">
          <Settings size={16} />
        </button>
      </div>
      <div className="provider-list">
        {providers.map((provider) => (
          <article className="provider-row" key={provider.id}>
            <div>
              <strong>{provider.name}</strong>
              <span>{provider.defaultModel || provider.models.slice(0, 2).join(" / ")}</span>
            </div>
            <span className={provider.connected ? "status ready" : "status muted-status"}>
              {provider.connected ? "启用" : "停用"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}