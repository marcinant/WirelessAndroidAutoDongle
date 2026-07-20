// Tiny i18n: device-locale detection via Intl (Hermes ships Intl), a flat
// key -> string dictionary per language, and a t() with {var} interpolation.
// Add a language by adding a column to STRINGS and listing it in LANGS.

type Lang = 'en' | 'pl';
const LANGS: Lang[] = ['en', 'pl'];

function detectLang(): Lang {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    const base = loc.split('-')[0] as Lang;
    if (LANGS.includes(base)) return base;
  } catch {
    // fall through to default
  }
  return 'en';
}

let lang: Lang = detectLang();

export function setLang(l: Lang) {
  lang = l;
}
export function getLang(): Lang {
  return lang;
}

type Entry = Record<Lang, string>;

const STRINGS: Record<string, Entry> = {
  // Screen titles
  'title.devices': { en: 'My dongles', pl: 'Moje dongle' },
  'title.setup': { en: 'Set up dongle', pl: 'Konfiguracja dongla' },
  'title.dashboard': { en: 'AA Dongle', pl: 'Dongle AA' },
  'title.settings': { en: 'Settings', pl: 'Ustawienia' },
  'title.log': { en: 'Log', pl: 'Dziennik' },

  // Devices manager
  'dev.title': { en: 'Paired dongles', pl: 'Sparowane dongle' },
  'dev.empty': { en: 'No dongles yet. Add one below.', pl: 'Brak dongli. Dodaj poniżej.' },
  'dev.add': { en: 'Add dongle', pl: 'Dodaj dongle' },
  'dev.open': { en: 'Open', pl: 'Otwórz' },
  'dev.connect': { en: 'Connect', pl: 'Połącz' },
  'dev.disconnect': { en: 'Disconnect', pl: 'Rozłącz' },
  'dev.repair': { en: 'Re-pair', pl: 'Sparuj ponownie' },
  'dev.forget': { en: 'Forget', pl: 'Zapomnij' },
  'dev.forget.title': { en: 'Forget dongle', pl: 'Zapomnij dongle' },
  'dev.forget.body': { en: 'Remove {name} from the app? Bluetooth pairing on the phone is kept.', pl: 'Usunąć {name} z aplikacji? Parowanie Bluetooth w telefonie zostaje.' },
  'dev.forget.confirm': { en: 'Forget', pl: 'Zapomnij' },
  'dev.repaired.title': { en: 'Paired', pl: 'Sparowano' },
  'dev.repaired.body': { en: '{name} is bonded again.', pl: '{name} ponownie sparowany.' },

  // Onboarding
  'ob.find.title': { en: 'Find your dongle', pl: 'Znajdź dongle' },
  'ob.find.body': {
    en: 'Power the dongle (plug it into the car, or a USB power bank on your desk), then scan for nearby Bluetooth devices and pick it.',
    pl: 'Podłącz dongle do zasilania (do auta albo do powerbanku na biurku), potem wyszukaj urządzenia Bluetooth w pobliżu i wybierz go.',
  },
  'ob.find.button': { en: 'Scan for devices', pl: 'Szukaj urządzeń' },
  'ob.settings.button': { en: 'Pair in Bluetooth settings instead', pl: 'Sparuj w ustawieniach Bluetooth' },
  'ob.scanning.title': { en: 'Scanning…', pl: 'Skanowanie…' },
  'ob.scanning.body': {
    en: 'Pick the device named “AudiAndroidAuto-…” (or “WirelessAADongle-…” on older firmware). The list fills in as devices are found.',
    pl: 'Wybierz urządzenie o nazwie „AudiAndroidAuto-…” (lub „WirelessAADongle-…” na starszym firmware). Lista uzupełnia się w miarę wykrywania.',
  },
  'ob.scanning.empty': { en: 'No devices yet — keep the dongle powered and close.', pl: 'Jeszcze nic — trzymaj dongle zasilany i blisko.' },
  'ob.rescan': { en: 'Rescan', pl: 'Skanuj ponownie' },
  'ob.bonding': { en: 'Pairing {name}…', pl: 'Parowanie {name}…' },
  'ob.wifi.title': { en: 'Connect to the dongle', pl: 'Połącz z donglem' },
  'ob.wifi.ssid': { en: 'Wifi network (SSID)', pl: 'Sieć wifi (SSID)' },
  'ob.wifi.pass': { en: 'Wifi password', pl: 'Hasło wifi' },
  'ob.wifi.panelpass': { en: 'Panel password (optional)', pl: 'Hasło panelu (opcjonalnie)' },
  'ob.wifi.panelpass.ph': { en: 'only if you set AAWG_WEBUI_PASSWORD', pl: 'tylko jeśli ustawiłeś AAWG_WEBUI_PASSWORD' },
  'ob.connect': { en: 'Connect', pl: 'Połącz' },
  'ob.footer': {
    en: 'The dongle serves everything locally — no cloud account needed to set it up.',
    pl: 'Dongle działa lokalnie — do konfiguracji nie trzeba konta w chmurze.',
  },
  'ob.paired': { en: 'Paired {name}', pl: 'Sparowano {name}' },
  'ob.joining': { en: 'Joining the dongle wifi…', pl: 'Łączenie z wifi dongla…' },
  'ob.checking': { en: 'Checking the connection…', pl: 'Sprawdzanie połączenia…' },
  'ob.pairManualHint': { en: 'Pair the dongle in Bluetooth settings, then continue below.', pl: 'Sparuj dongle w ustawieniach Bluetooth, potem kontynuuj poniżej.' },

  // Alerts
  'alert.perms.title': { en: 'Permissions needed', pl: 'Wymagane uprawnienia' },
  'alert.perms.body': { en: 'Bluetooth (and location) are required to find the dongle.', pl: 'Bluetooth (i lokalizacja) są wymagane do wykrycia dongla.' },
  'alert.btoff.title': { en: 'Bluetooth is off', pl: 'Bluetooth wyłączony' },
  'alert.btoff.body': { en: 'Turn on Bluetooth, then try again.', pl: 'Włącz Bluetooth i spróbuj ponownie.' },
  'alert.bondfail.title': { en: 'Pairing failed', pl: 'Parowanie nieudane' },
  'alert.wififail.title': { en: 'Wifi join failed', pl: 'Nie udało się połączyć z wifi' },
  'alert.unreach.title': { en: 'Cannot reach the dongle', pl: 'Brak połączenia z donglem' },
  'alert.unreach.body': { en: 'Joined the wifi but the dongle did not answer. Double-check the wifi password.', pl: 'Połączono z wifi, ale dongle nie odpowiada. Sprawdź hasło wifi.' },

  // Dashboard
  'dash.offline': { en: 'Not connected to the dongle. Join the {ssid} wifi (or re-run setup) to see live data.', pl: 'Brak połączenia z donglem. Połącz się z siecią {ssid} (lub uruchom konfigurację ponownie), aby zobaczyć dane na żywo.' },
  'dash.uptime': { en: 'uptime {v}', pl: 'czas pracy {v}' },
  'dash.tile.daemon': { en: 'Daemon', pl: 'Usługa' },
  'dash.tile.bt': { en: 'Bluetooth', pl: 'Bluetooth' },
  'dash.tile.wifi': { en: 'Wifi client', pl: 'Klient wifi' },
  'dash.tile.session': { en: 'AA session', pl: 'Sesja AA' },
  'dash.tile.usb': { en: 'USB', pl: 'USB' },
  'dash.tile.link': { en: 'Link', pl: 'Łącze' },
  'dash.running': { en: 'running', pl: 'działa' },
  'dash.stopped': { en: 'stopped', pl: 'zatrzymana' },
  'dash.powered': { en: 'powered', pl: 'włączony' },
  'dash.off': { en: 'off', pl: 'wył.' },
  'dash.none': { en: 'none', pl: 'brak' },
  'dash.noclient': { en: 'no client', pl: 'brak klienta' },
  'dash.unknown': { en: '—', pl: '—' },
  'dash.stale': { en: 'stale — dongle unreachable', pl: 'nieaktualne — brak łączności z donglem' },
  'dash.stream': { en: 'Stream', pl: 'Strumień' },
  'dash.chart.tp': { en: 'Throughput (Mbps · phone→car / car→phone)', pl: 'Przepustowość (Mbps · telefon→auto / auto→telefon)' },
  'dash.chart.rtt': { en: 'Latency to phone (ms)', pl: 'Opóźnienie do telefonu (ms)' },
  'dash.chart.sig': { en: 'Wifi signal (dBm)', pl: 'Sygnał wifi (dBm)' },
  'dash.events': { en: 'Recent events', pl: 'Ostatnie zdarzenia' },
  'dash.noevents': { en: 'no events yet', pl: 'brak zdarzeń' },
  'dash.drops': { en: '{n} wifi disconnect(s) in recent history', pl: 'rozłączenia wifi: {n} w ostatnim czasie' },
  'dash.settings': { en: 'Settings', pl: 'Ustawienia' },
  'dash.log': { en: 'Log', pl: 'Dziennik' },

  // Config
  'cfg.load.err': { en: 'Could not load the dongle config. Are you on its wifi?', pl: 'Nie udało się wczytać konfiguracji dongla. Czy jesteś w jego sieci wifi?' },
  'cfg.ha.title': { en: 'Home Assistant', pl: 'Home Assistant' },
  'cfg.ha.help': { en: "Reports the car's status over the phone's mobile data (Bluetooth tethering). Create a long-lived token in HA → profile → security.", pl: 'Raportuje stan auta przez dane mobilne telefonu (tethering Bluetooth). Utwórz długoterminowy token w HA → profil → bezpieczeństwo.' },
  'cfg.ha.url': { en: 'URL', pl: 'URL' },
  'cfg.ha.token': { en: 'Token', pl: 'Token' },
  'cfg.ha.entity': { en: 'Entity', pl: 'Encja' },
  'cfg.ha.token.ph': { en: 'long-lived access token', pl: 'długoterminowy token dostępu' },
  'cfg.save': { en: 'Save', pl: 'Zapisz' },
  'cfg.ha.test': { en: 'Test connection', pl: 'Testuj połączenie' },
  'cfg.saving': { en: 'saving…', pl: 'zapisywanie…' },
  'cfg.testing': { en: 'testing…', pl: 'testowanie…' },
  'cfg.ha.ok': { en: 'OK: token accepted (checked from phone)', pl: 'OK: token zaakceptowany (sprawdzono z telefonu)' },
  'cfg.ha.rejected': { en: 'error: token rejected ({code})', pl: 'błąd: token odrzucony ({code})' },
  'cfg.ha.answered': { en: 'error: HA answered {code}', pl: 'błąd: HA odpowiedziało {code}' },
  'cfg.conn.title': { en: 'Connection', pl: 'Połączenie' },
  'cfg.conn.strategy': { en: 'Connection strategy', pl: 'Strategia połączenia' },
  'cfg.conn.dongle': { en: 'Dongle mode', pl: 'Tryb dongla' },
  'cfg.conn.phone': { en: 'Phone first', pl: 'Najpierw telefon' },
  'cfg.conn.usb': { en: 'USB first', pl: 'Najpierw USB' },
  'cfg.hsp.early': { en: 'Early HSP release', pl: 'Wczesne zwolnienie HSP' },
  'cfg.hsp.early.hint': { en: "Free the car's hands-free profile as soon as AA opens (recommended).", pl: 'Zwolnij profil hands-free auta gdy tylko AA wystartuje (zalecane).' },
  'cfg.hsp.disable': { en: 'Disable fake headset (HSP)', pl: 'Wyłącz sztuczny headset (HSP)' },
  'cfg.hsp.disable.hint': { en: "Keeps HFP for the car, but some phones then won't start wireless AA.", pl: 'Zachowuje HFP dla auta, ale niektóre telefony nie uruchomią wtedy wireless AA.' },
  'cfg.country': { en: 'Country code', pl: 'Kod kraju' },
  'cfg.cloud.title': { en: 'Cloud telemetry', pl: 'Telemetria w chmurze' },
  'cfg.cloud.help': { en: 'Optional generic JSON webhook, pushed over Bluetooth tethering.', pl: 'Opcjonalny webhook JSON, wysyłany przez tethering Bluetooth.' },
  'cfg.cloud.url': { en: 'Webhook URL', pl: 'URL webhooka' },
  'cfg.cloud.interval': { en: 'Push interval (s)', pl: 'Interwał wysyłki (s)' },
  'cfg.save.settings': { en: 'Save settings', pl: 'Zapisz ustawienia' },
  'cfg.reboot': { en: 'Reboot', pl: 'Restart' },
  'cfg.foot': { en: 'Changes take effect after a reboot.', pl: 'Zmiany działają po restarcie.' },
  'cfg.saved.title': { en: 'Saved', pl: 'Zapisano' },
  'cfg.saved.body': { en: 'Reboot the dongle to apply the changes.', pl: 'Zrestartuj dongle, aby zastosować zmiany.' },
  'cfg.savefail.title': { en: 'Save failed', pl: 'Zapis nieudany' },
  'cfg.reboot.title': { en: 'Reboot dongle', pl: 'Restart dongla' },
  'cfg.reboot.body': { en: 'Reboot now to apply changes?', pl: 'Zrestartować teraz, aby zastosować zmiany?' },
  'cfg.cancel': { en: 'Cancel', pl: 'Anuluj' },

  // Logs
  'log.loading': { en: 'loading…', pl: 'wczytywanie…' },
  'log.pause': { en: 'Pause', pl: 'Wstrzymaj' },
  'log.resume': { en: 'Resume', pl: 'Wznów' },
  'log.follow.on': { en: 'Follow on', pl: 'Śledzenie wł.' },
  'log.follow.off': { en: 'Follow off', pl: 'Śledzenie wył.' },
};

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let s = entry ? entry[lang] ?? entry.en : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return s;
}
