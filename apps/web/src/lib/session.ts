const SESSION_KEY = "loglog.session.id";
const SESSION_ID_RE = /^[A-Za-z0-9]{10}$/;
const CHARS =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generate(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	return Array.from(bytes, (b) => CHARS[b % 62]).join("");
}

export function getSessionId(): string {
	const stored = sessionStorage.getItem(SESSION_KEY);
	if (stored && SESSION_ID_RE.test(stored)) return stored;
	const id = generate();
	sessionStorage.setItem(SESSION_KEY, id);
	return id;
}
