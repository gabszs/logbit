import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/web/components/auth-provider";
import {
	useUpdateUserSettings,
	useUserSettings,
} from "@/web/hooks/use-user-settings";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
	theme: "system",
	setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function isValidTheme(value: string | null | undefined): value is Theme {
	return value === "dark" || value === "light" || value === "system";
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "vite-ui-theme",
	...props
}: ThemeProviderProps) {
	const auth = useAuth();
	const isAuthenticated = auth.isAuthenticated;
	const settingsQuery = useUserSettings();
	const updateSettings = useUpdateUserSettings();

	const [theme, setThemeState] = useState<Theme>(
		() => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
	);

	// Sync theme from backend when settings load
	useEffect(() => {
		if (!isAuthenticated || !settingsQuery.data) return;
		const backendTheme = settingsQuery.data.theme;
		if (isValidTheme(backendTheme) && backendTheme !== theme) {
			localStorage.setItem(storageKey, backendTheme);
			setThemeState(backendTheme);
		}
	}, [isAuthenticated, settingsQuery.data?.theme]);

	// Apply theme class to document
	useEffect(() => {
		const root = window.document.documentElement;
		root.classList.remove("light", "dark");

		if (theme === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";
			root.classList.add(systemTheme);
			return;
		}

		root.classList.add(theme);
	}, [theme]);

	const setTheme = (newTheme: Theme) => {
		localStorage.setItem(storageKey, newTheme);
		setThemeState(newTheme);

		if (isAuthenticated) {
			updateSettings({ theme: newTheme }).catch(console.error);
		}
	};

	const value = { theme, setTheme };

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			{children}
		</ThemeProviderContext.Provider>
	);
}

export const useTheme = () => {
	const context = useContext(ThemeProviderContext);

	if (context === undefined)
		throw new Error("useTheme must be used within a ThemeProvider");

	return context;
};
