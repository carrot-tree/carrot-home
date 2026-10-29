/* Carrot Home portable edition: BRAT edition: embedded defaults and fictional local samples. */
;(() => {
  const { Notice, Modal, Setting, TFile, normalizePath } = re;
  const base = 'Carrot Home 示例';
  const defaults = __CARROT_EMBEDDED_DEFAULTS__;
  const entries = __CARROT_EMBEDDED_SAMPLES__;
  const freshSettings = saved => saved == null || (typeof saved === 'object' && !Array.isArray(saved) && !Object.keys(saved).length);
  const dir = plugin => plugin.manifest.dir || `${plugin.app.vault.configDir}/plugins/carrot-home`;
  const localDate = offset => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + Number(offset));
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  const expandDates = text => text.replace(/\{\{DAY:([+-]?\d+)\}\}/g, (_, offset) => localDate(offset));
  async function folder(vault, path) {
    let current = '';
    for (const part of path.split('/').filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!await vault.adapter.exists(current)) {
        try { await vault.createFolder(current); }
        catch (error) { if (!await vault.adapter.exists(current)) throw error; }
      }
    }
  }
  async function seed(plugin) {
    const vault = plugin.app.vault, source = dir(plugin), marker = `${source}/share-install.json`;
    let state = null;
    if (await vault.adapter.exists(marker)) {
      state = JSON.parse(await vault.adapter.read(marker));
      if (state?.pending !== true) return;
    }
    // Upgrades preserve the recipient's settings and never add unsolicited samples.
    if (!state && !freshSettings(await plugin.loadData())) return;
    if (!state) await vault.adapter.write(marker, JSON.stringify({ version: 1, pending: true }));
    // Never overwrite a recipient's existing file, including partially completed installs.
    for (const entry of entries) {
      if (!entry.path.startsWith(`${base}/`) || entry.path.includes('\\') || entry.path.split('/').includes('..') || entry.binary || typeof entry.content !== 'string') throw new Error('Invalid sample path');
      if (await vault.adapter.exists(entry.path)) continue;
      await folder(vault, entry.path.slice(0, entry.path.lastIndexOf('/')));
      await vault.create(entry.path, expandDates(entry.content));
    }
    await vault.adapter.write(marker, JSON.stringify({ version: 1, initialized: localDate(0) }));
  }
  const oldLoadSettings = bs.prototype.loadSettings;
  bs.prototype.loadSettings = async function() {
    const saved = await this.loadData();
    if (freshSettings(saved)) {
      await this.saveData(JSON.parse(JSON.stringify(defaults)));
    }
    await oldLoadSettings.call(this);
  };
  class TopicModal extends Modal {
    onOpen() {
      this.titleEl.setText('新建选题');
      let title = '';
      new Setting(this.contentEl).setName('选题标题').addText(input => {
        input.setPlaceholder('例如：分享我的工作台').onChange(value => title = value);
        setTimeout(() => input.inputEl.focus(), 0);
      });
      new Setting(this.contentEl).addButton(button => button.setButtonText('创建选题').setCta().onClick(async () => {
        const name = title.trim().replace(/[\\/:*?"<>|\[\]#^\x00-\x1f]/g, '-').slice(0, 100).trim();
        if (!name || /^\.+$/.test(name)) return void new Notice('请填写一个有效的标题');
        button.setDisabled(true);
        try {
          const target = `${base}/选题`;
          await folder(this.app.vault, target);
          let path = normalizePath(`${target}/${name}.md`), n = 2;
          while (await this.app.vault.adapter.exists(path)) path = normalizePath(`${target}/${name} ${n++}.md`);
          const file = await this.app.vault.create(path, `---\ntitle: ${JSON.stringify(title.trim())}\ntype: video\nvideo_stage: idea\nproject_status: active\ncarrotProject: true\ncreated: ${localDate(0)}\ntags: [选题]\n---\n\n# ${title.trim().replace(/[\r\n]/g, ' ')}\n\n## 为什么想做\n\n## 提纲与脚本\n\n## 制作记录\n\n## 发布与复盘\n`);
          this.close();
          await this.app.workspace.getLeaf(true).openFile(file);
        } catch (error) { new Notice(`选题创建失败：${error.message}`); button.setDisabled(false); }
      }));
    }
    onClose() { this.contentEl.empty(); }
  }
  const oldOnload = bs.prototype.onload;
  bs.prototype.onload = async function() {
    try { await seed(this); }
    catch (error) { new Notice(`Carrot Home 示例初始化未完成：${error.message}。重新启用插件可重试。`, 10000); console.error('Carrot Home sample initialization', error); }
    this.addCommand({ id: 'share-new-topic', name: '新建选题', callback: () => new TopicModal(this.app).open() });
    this.addCommand({ id: 'share-guide', name: '打开分享版使用说明', callback: async () => {
      const file = this.app.vault.getAbstractFileByPath(`${base}/开始使用.md`);
      if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
    }});
    await oldOnload.call(this);
  };
  // The mobile drawing action works without installing an additional drawing plugin.
  const oldDrawing = bs.prototype.createNewDrawing;
  bs.prototype.createNewDrawing = async function() {
    if (this.app.plugins.plugins['obsidian-excalidraw-plugin']) return oldDrawing.call(this);
    if (!this.app.internalPlugins.getPluginById('canvas')?.enabled) return void new Notice('请先启用 Obsidian 核心插件“白板”');
    await folder(this.app.vault, `${base}/白板`);
    let path = `${base}/白板/新白板.canvas`, n = 2;
    while (await this.app.vault.adapter.exists(path)) path = `${base}/白板/新白板 ${n++}.canvas`;
    const file = await this.app.vault.create(path, '{"nodes":[],"edges":[]}');
    await this.app.workspace.getLeaf(true).openFile(file);
  };
})();
