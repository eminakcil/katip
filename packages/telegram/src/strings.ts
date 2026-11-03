// Every user-facing Telegram string (Turkish). Keep all bot copy here (CLAUDE.md).
// Date and time formatting helpers live in ./format.ts and are re-exported below.

export const strings = {
	buttons: {
		edit: "Düzenle",
		changeTime: "Saati değiştir",
		delete: "Sil",
	},

	/** "Not aldım. Yayın izle, 12 Kasım Perşembe 19:00." */
	confirmDated: (title: string, when: string) =>
		`Not aldım. ${title}, ${when}.`,
	/** "Not aldım: Wi-Fi şifresi kutunun altında." */
	confirmNote: (title: string) => `Not aldım: ${title}.`,
	/** `when` already carries the locative suffix, e.g. "18:30'da". */
	morningListAndReminder: (when: string) =>
		`O gün sabah listede ve ${when} hatırlatacağım.`,
	morningListOnly: "O gün sabah listede olacak.",
	reminderOnly: (when: string) => `${when} hatırlatacağım.`,
	replyHint: "Detay eklemek için bu mesajı yanıtla.",

	needsClarification:
		"Bunu tam anlayamadım. Biraz daha açık yazar mısın? Örneğin: “Yarın 15:00'te diş hekimi”.",
	parserUnavailable:
		"Şu an mesajını işleyemiyorum, biraz sonra tekrar dener misin? Mesajını kaydettim.",
	unsupportedType:
		"Tekrarlayan hatırlatmaları ve yıllık tarihleri henüz desteklemiyorum. Mesajını kaydettim.",
	notLinked: (webAppUrl: string) =>
		`Merhaba! Kâtip'i kullanmak için önce hesabını bağlaman gerekiyor. ${webAppUrl} adresinde giriş yap ve “Telegram'ı bağla” düğmesine bas.`,
	welcome:
		"Hazırım! Aklına gelen bir şeyi yaz, not alıp zamanı gelince hatırlatayım.",
	todayHeader: (date: string) => `Bugün, ${date}:`,
	todayEmpty: "Bugün için kayıtlı bir şey yok. Aklına geleni yazman yeterli.",
	todayAllDay: (title: string) => `• Tüm gün: ${title}`,
	todayTimed: (time: string, title: string) => `• ${time} ${title}`,
	weekHeader: "Önümüzdeki 7 gün:",
	weekEmpty:
		"Önümüzdeki 7 gün için kayıtlı bir şey yok. Aklına geleni yazman yeterli.",
	allHeader: "Tüm kayıtların:",
	allEmpty: "Kayıtlı bir şey yok. Aklına geleni yazman yeterli.",
	allUndatedHeader: "Tarihsiz:",
	allUndatedLine: (title: string) => `• ${title}`,
	allMore: (count: number) => `… ve ${count} kayıt daha.`,
	commandComingSoon: "Bu komut yakında geliyor.",
	onlyText: "Şimdilik sadece yazılı mesajları anlayabiliyorum.",
	buttonComingSoon: "Bu özellik yakında geliyor.",

	/** Bot command menu (BotFather / setMyCommands). */
	commands: [
		{ command: "bugun", description: "Bugünün listesi" },
		{ command: "hafta", description: "Önümüzdeki 7 gün" },
		{ command: "liste", description: "Tüm kayıtlar" },
		{ command: "baglan", description: "Hesabını bağla" },
	],
} as const;

export { formatDateTr, formatTimeTr, withLocative } from "./format";
