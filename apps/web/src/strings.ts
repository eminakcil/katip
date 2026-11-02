// All user-facing web copy (Turkish). Keep every UI string here (CLAUDE.md).
export const strings = {
	appName: "Kâtip",
	nav: {
		home: "Ana sayfa",
		dashboard: "Panel",
	},
	theme: {
		toggle: "Temayı değiştir",
		light: "Açık",
		dark: "Koyu",
		system: "Sistem",
	},
	userMenu: {
		signIn: "Giriş yap",
		myAccount: "Hesabım",
		signOut: "Çıkış yap",
	},
	login: {
		title: "Kâtip'e giriş yap",
		subtitle: "Söyle, anlasın, zamanında hatırlatsın.",
		google: "Google ile giriş yap",
		redirecting: "Yönlendiriliyor…",
		failed: "Giriş yapılamadı. Lütfen tekrar dene.",
	},
	home: {
		apiStatus: "Sunucu durumu",
		checking: "Kontrol ediliyor…",
		connected: "Bağlı",
		disconnected: "Bağlantı yok",
	},
	dashboard: {
		title: "Panel",
		welcome: (name: string) => `Hoş geldin, ${name}`,
	},
} as const;
