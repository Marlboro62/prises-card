/*
 * Carte Prises — custom:prises-card
 *
 * Prises connectées de Home Assistant rangées par pièce, dans le style des cartes MyElectricalData :
 * marche / arrêt (arrêt confirmé), puissance instantanée, énergie consommée, tension et courant
 * pour les prises qui les mesurent. Sans configuration, la carte trouve seule les prises et leurs capteurs.
 */
(() => {
const CARD_VERSION = "0.1.0-beta.1";

const DEFAULTS = {
  title: "",
  icon: "mdi:power-socket-fr",
  entities: [],
  areas: [],
  exclude: [],
  locked: [],
  show_off: true,
  show_details: true,
  confirm_off: true,
  sort: "name",
  max_power: 3680,
  theme: "v2",
  language: "auto",
};

/* ---------------------------------------------------------------- textes */

const I18N = {
  fr: {
    title: "Prises", off: "Éteinte", on: "Allumée", unavailable: "Indisponible",
    n_on: { one: "{n} prise allumée", other: "{n} prises allumées" }, none_on: "Toutes les prises sont éteintes",
    other_room: "Autres prises", confirm: "Éteindre ?", locked: "Prise verrouillée", toggle: "Allumer ou éteindre",
    total: "Puissance totale", today: "aujourd'hui", collapse: "Replier ou déplier la pièce", history: "Historique",
    none: "Aucune prise trouvée", none_hint: "La carte cherche les interrupteurs de type prise ou qui mesurent une puissance. Vous pouvez aussi les lister avec l'option entities.",
  },
  en: {
    title: "Plugs", off: "Off", on: "On", unavailable: "Unavailable",
    n_on: { one: "{n} plug on", other: "{n} plugs on" }, none_on: "All plugs are off",
    other_room: "Other plugs", confirm: "Turn off?", locked: "Locked plug", toggle: "Turn on or off",
    total: "Total power", today: "today", collapse: "Collapse or expand the room", history: "History",
    none: "No plugs found", none_hint: "The card looks for outlet switches or switches that measure power. You can also list them with the entities option.",
  },
  pl: {
    title: "Gniazdka", off: "Wyłączone", on: "Włączone", unavailable: "Niedostępne",
    n_on: { one: "{n} gniazdko włączone", few: "{n} gniazdka włączone", many: "{n} gniazdek włączonych", other: "{n} gniazdek włączonych" },
    none_on: "Wszystkie gniazdka wyłączone", other_room: "Inne gniazdka", confirm: "Wyłączyć?", locked: "Gniazdko zablokowane",
    toggle: "Włącz lub wyłącz", total: "Moc łączna", today: "dziś", collapse: "Zwiń lub rozwiń pomieszczenie", history: "Historia",
    none: "Nie znaleziono gniazdek", none_hint: "Karta szuka przełączników typu gniazdko lub mierzących moc. Możesz też podać je w opcji entities.",
  },
};

const EDITOR_LABELS = {
  fr: { title: "Titre (Prises par défaut)", icon: "Icône", entities: "Prises (trouvées seules si vide)", areas: "Pièces affichées (toutes si vide)",
    exclude: "Prises à masquer", locked: "Prises verrouillées (pas de bouton)", show_off: "Afficher les prises éteintes",
    show_details: "Afficher tension et courant", confirm_off: "Confirmer avant d'éteindre", sort: "Ordre dans chaque pièce",
    max_power: "Puissance de la barre pleine (W)", theme: "Couleurs de la carte", language: "Langue" },
  en: { title: "Title (Plugs by default)", icon: "Icon", entities: "Plugs (found automatically if empty)", areas: "Rooms shown (all if empty)",
    exclude: "Plugs to hide", locked: "Locked plugs (no button)", show_off: "Show plugs that are off",
    show_details: "Show voltage and current", confirm_off: "Confirm before turning off", sort: "Order in each room",
    max_power: "Power of a full bar (W)", theme: "Card colours", language: "Language" },
  pl: { title: "Tytuł (domyślnie Gniazdka)", icon: "Ikona", entities: "Gniazdka (wykrywane, jeśli puste)", areas: "Pokazane pomieszczenia (wszystkie, jeśli puste)",
    exclude: "Ukryte gniazdka", locked: "Zablokowane gniazdka (bez przycisku)", show_off: "Pokaż wyłączone gniazdka",
    show_details: "Pokaż napięcie i prąd", confirm_off: "Potwierdź przed wyłączeniem", sort: "Kolejność w pomieszczeniu",
    max_power: "Moc pełnego paska (W)", theme: "Kolory karty", language: "Język" },
};

const PLUG_NAME = /prise|plug|socket|outlet|steckdose|gniazd/i;
const TODAY = /today|aujourd|daily|journ|jour|dzis|dzi[sś]|heute/i;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = JSON.parse(window.localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
};
const num = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : null; };

class PrisesCard extends HTMLElement {
  constructor() {
    super();
    this._armed = null;
  }

  static getStubConfig() {
    return {};
  }

  /** Éditeur visuel : formulaire de Home Assistant. */
  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "entities", selector: { entity: { multiple: true, filter: { domain: "switch" } } } },
        { name: "areas", selector: { area: { multiple: true } } },
        { name: "exclude", selector: { entity: { multiple: true, filter: { domain: "switch" } } } },
        { name: "locked", selector: { entity: { multiple: true, filter: { domain: "switch" } } } },
        { type: "grid", name: "", schema: [
          { name: "show_off", selector: { boolean: {} } },
          { name: "show_details", selector: { boolean: {} } },
          { name: "confirm_off", selector: { boolean: {} } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "sort", selector: { select: { mode: "dropdown", options: [
            { value: "name", label: "Nom" }, { value: "power", label: "Puissance (la plus forte en premier)" }] } } },
          { name: "max_power", selector: { number: { min: 100, max: 10000, step: 10, mode: "box", unit_of_measurement: "W" } } },
        ] },
        { name: "theme", selector: { select: { mode: "dropdown", options: [
          { value: "v2", label: "Bleu nuit (style MyElectricalData)" },
          { value: "auto", label: "Bleu nuit, clair si Home Assistant est en mode clair" },
          { value: "ha", label: "Thème de Home Assistant" }] } } },
        { name: "language", selector: { select: { mode: "dropdown", options: [
          { value: "auto", label: "Langue de Home Assistant" }, { value: "fr", label: "Français" },
          { value: "en", label: "English" }, { value: "pl", label: "Polski" }] } } },
      ],
      computeLabel: (s, data, hass) => {
        const lang = String(hass?.locale?.language || hass?.language || "fr").slice(0, 2);
        return (EDITOR_LABELS[lang] || EDITOR_LABELS.fr)[s.name] || s.name;
      },
    };
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...(config || {}) };
    for (const k of ["entities", "areas", "exclude", "locked"]) {
      const v = this._config[k];
      this._config[k] = Array.isArray(v) ? v : v ? [v] : [];
    }
    this._sig = null;
    if (!this.shadowRoot) this._init();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  disconnectedCallback() {
    clearTimeout(this._armTimer);
  }

  /* -------------------------------------------------------- événements */

  _init() {
    this.attachShadow({ mode: "open" });
    this._collapsed = new Set(store.get("prises-card:collapsed", []));
    this.shadowRoot.addEventListener("click", (ev) => {
      const el = ev.target.closest?.("[data-act]");
      if (!el) return;
      const { act, id } = el.dataset;
      if (act === "toggle") this._toggle(id);
      else if (act === "info") this._moreInfo(id);
      else if (act === "room") {
        this._collapsed.has(id) ? this._collapsed.delete(id) : this._collapsed.add(id);
        store.set("prises-card:collapsed", [...this._collapsed]);
        this._sig = null; this._render();
      }
    });
    this.shadowRoot.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.("[data-act]:not(button)")) { ev.preventDefault(); ev.target.click(); }
    });
  }

  /** Allumer d'un clic ; éteindre en deux clics (confirm_off), pour ne pas couper un congélateur par erreur. */
  _toggle(id) {
    const on = this._hass.states[id]?.state === "on";
    if (!on) { this._disarm(); this._call("switch", "turn_on", { entity_id: id }); return; }
    if (this._config.confirm_off && this._armed !== id) {
      this._armed = id;
      clearTimeout(this._armTimer);
      this._armTimer = setTimeout(() => this._disarm(), 4000);
      this._sig = null; this._render();
      return;
    }
    this._disarm();
    this._call("switch", "turn_off", { entity_id: id });
  }

  _disarm() {
    if (this._armed === null) return;
    this._armed = null;
    clearTimeout(this._armTimer);
    this._sig = null; this._render();
  }

  _call(domain, service, data) {
    this._hass?.callService(domain, service, data);
  }

  _moreInfo(entityId) {
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  /* ------------------------------------------------------------ données */

  _t() {
    const want = this._config.language === "auto" ? String(this._hass?.locale?.language || this._hass?.language || "fr").slice(0, 2) : this._config.language;
    this._lang = I18N[want] ? want : "fr";
    return I18N[this._lang];
  }

  _fmt(key, vars = {}) {
    let s = this._t()[key] ?? key;
    if (typeof s === "object") s = s[new Intl.PluralRules(this._lang).select(Number(vars.n))] ?? s.other;
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }

  _n(v, digits = 0) {
    const loc = this._hass?.locale?.number_format === "comma_decimal" ? "en-US" : this._hass?.locale?.number_format === "decimal_comma" ? "de-DE" : this._lang;
    return Number(v).toLocaleString(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  _areaOf(id) {
    const e = this._hass.entities?.[id];
    if (!e) return null;
    return e.area_id || this._hass.devices?.[e.device_id]?.area_id || null;
  }

  _visible(id) {
    const e = this._hass.entities?.[id];
    return !(e && (e.hidden || e.entity_category));
  }

  /** Capteurs de chaque appareil : puissance, énergie (du jour en priorité), tension, courant. */
  _sensorsByDevice() {
    const out = new Map(), hass = this._hass;
    for (const [id, e] of Object.entries(hass.entities || {})) {
      if (!id.startsWith("sensor.") || !e.device_id || !hass.states[id]) continue;
      const a = hass.states[id].attributes || {};
      const dc = a.device_class, unit = a.unit_of_measurement;
      const slot = out.get(e.device_id) || {};
      if (dc === "power" || ["W", "kW"].includes(unit)) slot.power ||= id;
      else if (dc === "energy" || ["kWh", "Wh"].includes(unit)) {
        const label = `${id} ${a.friendly_name || ""}`;
        if (TODAY.test(label)) slot.today ||= id; else slot.energy ||= id;
      } else if (dc === "voltage" || unit === "V") slot.voltage ||= id;
      else if (dc === "current" || ["A", "mA"].includes(unit)) slot.current ||= id;
      out.set(e.device_id, slot);
    }
    return out;
  }

  /** Prises affichées, avec leurs capteurs. */
  _plugs() {
    const c = this._config, hass = this._hass;
    const sensors = this._sensorsByDevice();
    const exclude = new Set(c.exclude);
    const locked = new Set(c.locked);
    const make = (id, extra = {}) => {
      const dev = hass.entities?.[id]?.device_id;
      const s = (dev && sensors.get(dev)) || {};
      return { id, power: extra.power || s.power, energy: extra.energy || s.today || s.energy, today: !extra.energy && !!s.today,
        voltage: extra.voltage || s.voltage, current: extra.current || s.current, name: extra.name, icon: extra.icon,
        locked: extra.locked ?? locked.has(id) };
    };
    if (c.entities.length) {
      return c.entities.map((x) => (typeof x === "string" ? make(x) : x?.entity ? make(x.entity, x) : null))
        .filter((p) => p && hass.states[p.id] && !exclude.has(p.id));
    }
    const out = [];
    for (const id of Object.keys(hass.states)) {
      if (!id.startsWith("switch.") || exclude.has(id) || !this._visible(id)) continue;
      const st = hass.states[id];
      const dev = hass.entities?.[id]?.device_id;
      const measured = !!(dev && sensors.get(dev)?.power);
      if (st.attributes?.device_class === "outlet" || measured || PLUG_NAME.test(`${id} ${st.attributes?.friendly_name || ""}`)) out.push(make(id));
    }
    return out;
  }

  _watts(p) {
    const st = p.power && this._hass.states[p.power];
    const v = num(st?.state);
    if (v === null) return null;
    return st.attributes?.unit_of_measurement === "kW" ? v * 1000 : v;
  }

  _kwh(p) {
    const st = p.energy && this._hass.states[p.energy];
    const v = num(st?.state);
    if (v === null) return null;
    return st.attributes?.unit_of_measurement === "Wh" ? v / 1000 : v;
  }

  _name(p) {
    if (p.name) return p.name;
    const st = this._hass.states[p.id];
    const e = this._hass.entities?.[p.id];
    let name = e?.name || st?.attributes?.friendly_name || this._hass.devices?.[e?.device_id]?.name_by_user || this._hass.devices?.[e?.device_id]?.name || p.id;
    const area = this._hass.areas?.[this._areaOf(p.id)]?.name;
    if (area && name.toLowerCase().startsWith(`${area.toLowerCase()} `) && name.length > area.length + 1) {
      name = name.slice(area.length + 1);
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }
    return name;
  }

  _rooms(plugs) {
    const c = this._config, hass = this._hass;
    const only = new Set(c.areas);
    const groups = new Map();
    for (const p of plugs) {
      const area = this._areaOf(p.id) || "";
      if (only.size && !only.has(area)) continue;
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(p);
    }
    const floors = hass.floors || {};
    const level = (a) => floors[hass.areas?.[a]?.floor_id]?.level ?? 999;
    const order = only.size ? [...only] : null;
    const byPower = c.sort === "power";
    const rooms = [...groups.entries()].map(([area, list]) => ({
      area,
      name: hass.areas?.[area]?.name || this._t().other_room,
      icon: hass.areas?.[area]?.icon || (area ? "mdi:door" : "mdi:power-socket-fr"),
      plugs: list.sort((a, b) => (byPower ? (this._watts(b) ?? -1) - (this._watts(a) ?? -1) : 0) || this._name(a).localeCompare(this._name(b), this._lang)),
    }));
    rooms.sort((a, b) => {
      if (!a.area !== !b.area) return a.area ? -1 : 1;
      if (order) return order.indexOf(a.area) - order.indexOf(b.area);
      return level(a.area) - level(b.area) || a.name.localeCompare(b.name, this._lang);
    });
    return rooms;
  }

  /* ---------------------------------------------------------- affichage */

  _themeClass() {
    const light = this._hass?.themes?.darkMode === false, th = this._config.theme;
    if (th === "ha") return `th-ha${light ? " light" : ""}`;
    if (th === "auto" && light) return "light";
    return "";
  }

  _w(w) {
    return w >= 10000 ? `${this._n(w / 1000, 1)} kW` : `${this._n(w, w < 10 && w % 1 ? 1 : 0)} W`;
  }

  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const T = this._t(), c = this._config;
    const plugs = this._plugs();
    const rooms = this._rooms(plugs);
    const shown = rooms.flatMap((r) => r.plugs);
    const watch = shown.flatMap((p) => [p.id, p.power, p.energy, p.voltage, p.current]).filter(Boolean);
    const sig = JSON.stringify([c, this._lang, this._hass.themes?.darkMode, this._armed, [...this._collapsed],
      watch.map((id) => [id, this._hass.states[id]?.state])]);
    if (sig === this._sig) return;
    this._sig = sig;

    const on = shown.filter((p) => this._hass.states[p.id].state === "on");
    const watts = shown.map((p) => this._watts(p)).filter((w) => w !== null);
    const total = watts.reduce((a, b) => a + b, 0);
    const head = `<header>
      <div class="brand"><span class="logo${on.length ? " on" : ""}"><ha-icon icon="${esc(c.icon || DEFAULTS.icon)}"></ha-icon></span>
        <div><div class="title">${esc(c.title || T.title)}</div>
        <div class="sub">${esc(on.length ? this._fmt("n_on", { n: on.length }) : T.none_on)}</div></div></div>
      ${watts.length ? `<div class="pc-total" title="${esc(T.total)}"><ha-icon icon="mdi:flash"></ha-icon><b>${esc(this._w(total))}</b></div>` : ""}
    </header>`;
    const body = shown.length
      ? rooms.map((r) => this._room(r)).join("")
      : `<div class="empty"><b>${esc(T.none)}</b><span>${esc(T.none_hint)}</span></div>`;
    this.shadowRoot.innerHTML = `${STYLE}<ha-card class="${this._themeClass()}">${head}<div class="pc-rooms">${body}</div></ha-card>`;
  }

  _room(r) {
    const T = this._t(), c = this._config;
    const on = r.plugs.filter((p) => this._hass.states[p.id].state === "on");
    const list = c.show_off ? r.plugs : on;
    if (!list.length) return "";
    const key = r.area || "_other";
    const closed = this._collapsed.has(key);
    const watts = r.plugs.map((p) => this._watts(p)).filter((w) => w !== null);
    const total = watts.reduce((a, b) => a + b, 0);
    return `<section class="pc-room${on.length ? " on" : ""}">
      <div class="pc-rt" data-act="room" data-id="${esc(key)}" role="button" tabindex="0" aria-expanded="${!closed}" title="${esc(T.collapse)}">
        <ha-icon icon="${esc(r.icon)}"></ha-icon><b>${esc(r.name)}</b>
        <span class="pc-count">${on.length}/${r.plugs.length}</span>
        ${watts.length ? `<span class="pc-rw">${esc(this._w(total))}</span>` : ""}
        <ha-icon class="pc-chev" icon="${closed ? "mdi:chevron-down" : "mdi:chevron-up"}"></ha-icon>
      </div>
      ${closed ? "" : `<div class="pc-list">${list.map((p) => this._plug(p)).join("")}</div>`}
    </section>`;
  }

  _plug(p) {
    const T = this._t(), c = this._config;
    const s = this._hass.states[p.id];
    const on = s.state === "on", off = s.state === "off";
    const w = this._watts(p), kwh = this._kwh(p);
    const v = num(this._hass.states[p.voltage]?.state), aSt = this._hass.states[p.current];
    let amp = num(aSt?.state);
    if (amp !== null && aSt.attributes?.unit_of_measurement === "mA") amp /= 1000;
    const armed = this._armed === p.id;
    const max = Math.max(100, Number(c.max_power) || 3680);
    const level = w === null ? "" : w >= max * 0.55 ? "bad" : w >= max * 0.15 ? "warn" : "ok";
    const bar = on && w !== null ? Math.min(100, Math.sqrt(Math.max(0, w) / max) * 100) : 0;

    const main = on ? (w !== null ? this._w(w) : T.on) : off ? T.off : T.unavailable;
    const parts = [];
    if (kwh !== null) parts.push(`${this._n(kwh, kwh < 10 ? 2 : 1)} kWh${p.today ? ` ${T.today}` : ""}`);
    if (c.show_details && on && v !== null) parts.push(`${this._n(v)} V`);
    if (c.show_details && on && amp !== null) parts.push(`${this._n(amp, 2)} A`);
    const icon = p.icon || s.attributes?.icon || (on ? "mdi:power-socket-fr" : "mdi:power-socket-fr");

    const ctrl = p.locked
      ? `<span class="pc-lock" title="${esc(T.locked)}"><ha-icon icon="mdi:lock"></ha-icon></span>`
      : armed
        ? `<button class="pc-confirm" data-act="toggle" data-id="${esc(p.id)}">${esc(T.confirm)}</button>`
        : `<button class="pc-sw${on ? " on" : ""}" data-act="toggle" data-id="${esc(p.id)}" role="switch" aria-checked="${on}" aria-label="${esc(T.toggle)}" ${on || off ? "" : "disabled"}><i></i></button>`;

    return `<div class="pc-plug${on ? " on" : ""}${on || off ? "" : " na"} ${level}">
      <div class="pc-row">
        <span class="pc-ico"><ha-icon icon="${esc(icon)}"></ha-icon></span>
        <div class="pc-name" data-act="info" data-id="${esc(p.id)}" role="button" tabindex="0">
          <b>${esc(this._name(p))}</b>
          <span>${p.power ? `<em class="pc-w" data-act="info" data-id="${esc(p.power)}" title="${esc(T.history)}">${esc(main)}</em>` : `<em>${esc(main)}</em>`}${parts.length ? ` · ${esc(parts.join(" · "))}` : ""}</span>
        </div>
        ${ctrl}
      </div>
      ${on && w !== null ? `<div class="pc-bar" aria-hidden="true"><i style="width:${bar.toFixed(1)}%"></i></div>` : ""}
    </div>`;
  }
}

const STYLE = `<style>
:host {
  --med-bg: #1a2434; --med-surface: #212d40; --med-line: #2f3d55; --med-text: #e7edf5; --med-muted: #8fa0b8;
  --med-accent: #1d93e3; --med-on-accent: #fff; --med-green: #96d21f; --pc-ok: #5fcf8a; --pc-warn: #f0a33a; --pc-bad: #ee4a4a;
}
ha-card { display: block; background: var(--med-bg); color: var(--med-text); border: 1px solid var(--med-line); border-radius: 18px;
  overflow: hidden; padding-bottom: 12px; container-type: inline-size; font-variant-numeric: tabular-nums; }
ha-card.light { --med-bg: #f4f6fa; --med-surface: #e8edf4; --med-line: #d3dbe6; --med-text: #1a2434; --med-muted: #5b6b82; --med-accent: #1673b8;
  --med-green: #4c8a0b; --pc-ok: #1d8a4b; --pc-warn: #b0640a; --pc-bad: #c62f2f; }
ha-card.th-ha { --med-bg: var(--ha-card-background, var(--card-background-color)); --med-surface: color-mix(in srgb, var(--primary-text-color, #000) 6%, transparent);
  --med-line: var(--divider-color, rgba(127,127,127,.25)); --med-text: var(--primary-text-color); --med-muted: var(--secondary-text-color);
  --med-accent: var(--primary-color, #1d93e3); --med-on-accent: var(--text-primary-color, #fff); border-radius: var(--ha-card-border-radius, 12px); }
ha-card.th-ha.light { --pc-ok: #1d8a4b; --pc-warn: #b0640a; --pc-bad: #c62f2f; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 10px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.logo { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: var(--med-surface); flex: none; }
.logo ha-icon { --mdc-icon-size: 22px; color: var(--med-muted); }
.logo.on { background: color-mix(in srgb, var(--med-accent) 20%, transparent); }
.logo.on ha-icon { color: var(--med-accent); }
.title { font-size: 1.12rem; font-weight: 700; }
.sub { font-size: .78rem; color: var(--med-muted); }
.pc-total { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; border: 1px solid var(--med-line); background: var(--med-surface); padding: 6px 12px; }
.pc-total ha-icon { --mdc-icon-size: 18px; color: var(--pc-warn); }
.pc-total b { font-size: .95rem; }
button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, [role=button]:focus-visible { outline: 2px solid var(--med-accent); outline-offset: 2px; }
.pc-rooms { display: flex; flex-direction: column; gap: 10px; padding: 0 12px; }
.pc-room { border: 1px solid var(--med-line); border-radius: 14px; padding: 8px; }
.pc-room.on { border-color: color-mix(in srgb, var(--med-accent) 35%, var(--med-line)); }
.pc-rt { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 2px 4px 4px; border-radius: 8px; }
.pc-rt > ha-icon { --mdc-icon-size: 18px; color: var(--med-muted); }
.pc-room.on .pc-rt > ha-icon:first-child { color: var(--med-accent); }
.pc-rt b { font-size: .92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-count { font-size: .74rem; color: var(--med-muted); }
.pc-rw { margin-left: auto; font-size: .78rem; font-weight: 600; }
.pc-chev { --mdc-icon-size: 18px; color: var(--med-muted); }
.pc-rw + .pc-chev { margin-left: 0; }
.pc-count + .pc-chev { margin-left: auto; }
.pc-list { display: grid; grid-template-columns: 1fr; gap: 6px; margin-top: 6px; align-items: start; }
@container (min-width: 560px) { .pc-list { grid-template-columns: 1fr 1fr; } }
.pc-plug { background: var(--med-surface); border-radius: 12px; padding: 8px 10px; border: 1px solid transparent; min-width: 0; --lvl: var(--pc-ok); }
.pc-plug.warn { --lvl: var(--pc-warn); } .pc-plug.bad { --lvl: var(--pc-bad); }
.pc-plug.on { border-color: color-mix(in srgb, var(--med-accent) 40%, transparent); background: color-mix(in srgb, var(--med-accent) 8%, var(--med-surface)); }
.pc-plug.na { opacity: .55; }
.pc-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pc-ico { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; flex: none; background: color-mix(in srgb, var(--med-text) 8%, transparent); }
.pc-ico ha-icon { --mdc-icon-size: 21px; color: var(--med-muted); }
.pc-plug.on .pc-ico { background: color-mix(in srgb, var(--med-accent) 24%, transparent); }
.pc-plug.on .pc-ico ha-icon { color: var(--med-accent); }
.pc-name { flex: 1; min-width: 0; display: flex; flex-direction: column; cursor: pointer; border-radius: 8px; }
.pc-name b { font-size: .88rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-name span { font-size: .74rem; color: var(--med-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-name em { font-style: normal; }
.pc-plug.on .pc-w { color: var(--med-text); font-weight: 700; }
.pc-w { cursor: pointer; text-decoration: underline dotted color-mix(in srgb, var(--med-muted) 60%, transparent); text-underline-offset: 3px; }
.pc-sw { width: 42px; height: 24px; border-radius: 12px; border: 0; padding: 0; position: relative; flex: none;
  background: color-mix(in srgb, var(--med-text) 18%, transparent); transition: background .2s; }
.pc-sw i { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.pc-sw.on { background: var(--med-accent); }
.pc-sw.on i { transform: translateX(18px); }
.pc-sw:disabled { cursor: default; }
.pc-confirm { border-radius: 999px; border: 1px solid var(--pc-bad); background: color-mix(in srgb, var(--pc-bad) 15%, transparent); color: var(--pc-bad);
  padding: 3px 10px; font-size: .76rem; font-weight: 700; flex: none; animation: pc-pulse 1s ease-in-out infinite; }
@keyframes pc-pulse { 50% { background: color-mix(in srgb, var(--pc-bad) 30%, transparent); } }
.pc-lock { width: 42px; display: grid; place-items: center; flex: none; }
.pc-lock ha-icon { --mdc-icon-size: 18px; color: var(--med-muted); }
.pc-bar { height: 6px; border-radius: 4px; background: color-mix(in srgb, var(--med-text) 12%, transparent); overflow: hidden; margin: 8px 0 2px 48px; }
.pc-bar i { display: block; height: 100%; border-radius: 4px; background: var(--lvl); }
.empty { display: flex; flex-direction: column; gap: 6px; padding: 8px 4px 4px; font-size: .88rem; }
.empty span { color: var(--med-muted); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>`;

if (!customElements.get("prises-card")) customElements.define("prises-card", PrisesCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "prises-card")) {
  window.customCards.push({
    type: "prises-card",
    name: "Prises",
    description: "Prises connectées par pièce : marche / arrêt, puissance, énergie consommée, tension et courant (style MyElectricalData).",
    preview: true,
    documentationURL: "https://github.com/Marlboro62/prises-card",
  });
}
console.info(`%c PRISES-CARD %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
})();
