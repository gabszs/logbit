import type { SupportedIntegrationKind } from "@/server/integrations/registry";

type IntegrationMeta = {
	name: string;
	logo: React.FC<React.SVGProps<SVGSVGElement>>;
};

export const INTEGRATIONS = {
	clickhouse: {
		name: "ClickHouse",
		logo: (props) => (
			<svg
				role="img"
				aria-label="ClickHouse logo"
				viewBox="0 0 9 8"
				xmlns="http://www.w3.org/2000/svg"
				{...props}
			>
				<path d="m0 7h1v1h-1z" fill="#f00" />
				<path
					d="m0 0h1v7h-1zm2 0h1v8h-1zm2 0h1v8h-1zm2 0h1v8h-1zm2 3.25h1v1.5h-1z"
					fill="#fc0"
				/>
			</svg>
		),
	},
	resend: {
		name: "Resend",
		logo: (props) => (
			<svg
				role="img"
				aria-label="Resend logo"
				viewBox="0 0 1800 1800"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				{...props}
			>
				<path
					d="M1000.46 450C1174.77 450 1278.43 553.669 1278.43 691.282C1278.43 828.896 1174.77 932.563 1000.46 932.563H912.382L1350 1350H1040.82L707.794 1033.48C683.944 1011.47 672.936 985.781 672.935 963.765C672.935 932.572 694.959 905.049 737.161 893.122L908.712 847.244C973.85 829.812 1018.81 779.353 1018.81 713.298C1018.8 632.567 952.745 585.78 871.095 585.78H450V450H1000.46Z"
					fill="currentColor"
				/>
			</svg>
		),
	},
	cloudflare: {
		name: "Cloudflare",
		logo: (props) => (
			<svg
				role="img"
				aria-label="Cloudflare logo"
				viewBox="0 0 256 116"
				xmlns="http://www.w3.org/2000/svg"
				preserveAspectRatio="xMidYMid"
				{...props}
			>
				<defs>
					<radialGradient
						cx="54.701%"
						cy="52.771%"
						fx="54.701%"
						fy="52.771%"
						r="49.979%"
						id="cf-a"
					>
						<stop stopColor="#FFF" offset="0%" />
						<stop stopColor="#FCE800" offset="19.02%" />
						<stop stopColor="#EC8F27" offset="85.93%" />
					</radialGradient>
					<linearGradient
						x1="50.033%"
						y1="40.182%"
						x2="50.033%"
						y2="-6.53%"
						id="cf-b"
					>
						<stop stopColor="#F68B1F" offset="0%" />
						<stop stopColor="#FFF" offset="100%" />
					</linearGradient>
					<linearGradient
						x1="23.113%"
						y1="2.836%"
						x2="49.169%"
						y2="48.674%"
						id="cf-c"
					>
						<stop stopColor="#FFF" offset="0%" />
						<stop stopColor="#FEF6ED" offset="4.821%" />
						<stop stopColor="#FBD0A5" offset="25.69%" />
						<stop stopColor="#F9B26B" offset="44.42%" />
						<stop stopColor="#F79D42" offset="60.34%" />
						<stop stopColor="#F69028" offset="72.82%" />
						<stop stopColor="#F68B1F" offset="80.33%" />
					</linearGradient>
					<linearGradient
						x1="-6.441%"
						y1="-87.453%"
						x2="83.291%"
						y2="187.144%"
						id="cf-d"
					>
						<stop stopColor="#FFF" offset="0%" />
						<stop stopColor="#FEF6ED" offset="4.821%" />
						<stop stopColor="#FBD0A5" offset="25.69%" />
						<stop stopColor="#F9B26B" offset="44.42%" />
						<stop stopColor="#F79D42" offset="60.34%" />
						<stop stopColor="#F69028" offset="72.82%" />
						<stop stopColor="#F68B1F" offset="80.33%" />
					</linearGradient>
					<linearGradient
						x1="67.858%"
						y1="-4.377%"
						x2="52.765%"
						y2="67.743%"
						id="cf-e"
					>
						<stop stopColor="#FFF" offset="0%" />
						<stop stopColor="#FEF6ED" offset="4.821%" />
						<stop stopColor="#FBD0A5" offset="25.69%" />
						<stop stopColor="#F9B26B" offset="44.42%" />
						<stop stopColor="#F79D42" offset="60.34%" />
						<stop stopColor="#F69028" offset="72.82%" />
						<stop stopColor="#F68B1F" offset="80.33%" />
					</linearGradient>
					<linearGradient
						x1="49.993%"
						y1=".354%"
						x2="49.993%"
						y2="99.773%"
						id="cf-f"
					>
						<stop stopColor="#F68B1F" offset="0%" />
						<stop stopColor="#CB672F" offset="53.08%" />
						<stop stopColor="#A1453F" offset="100%" />
					</linearGradient>
					<radialGradient
						cx="50.374%"
						cy="60.571%"
						fx="50.374%"
						fy="60.571%"
						r="51.634%"
						id="cf-g"
					>
						<stop stopColor="#FFF" offset="0%" />
						<stop stopColor="#FCE800" offset="13.34%" />
						<stop stopColor="#EC8F27" offset="85.93%" />
					</radialGradient>
				</defs>
				<path
					d="M199 33.9l5.8-20.1.8.1.6 21.1L217 17.1l1 .5-5.1 20.3 15.3-14.5.8.7-10.3 18.4 18.6-9.9.6.7-14.8 15.2 20.6-4.7.4.8-18.2 10.7 21.1.8v.9l-20.4 5.6 20.3 6v.9l-21.1.3L243.7 81l-.5.9-20.4-5.1L237.2 92l-.5.9-18.2-10.5 9.7 18.5-.9.7-15-14.7 5 20.3-1 .6-10.7-18.2-.3 20.9-1.1.3-5.8-20.2-6 20.2-1.1-.3V89.6l-.6-.2-11.6 17.5 5-20.3-15.3 14.4-.9-.7 10.5-18.2-18.8 9.7-.6-.7 14.8-14.9-20.6 4.5-.3-.8 18.3-10.7-20.9-.8-.4-.9 20.3-5.7-20-5.9.1-1 21-.3-17.8-10.8.1-1 20.6 5.2-14.6-15.4.8-.8 18.4 10.1-10-18.3.6-.7 15.4 14.8-5-20.6-.2-.3L191.8 35l.2-21.2h1.2l5.8 20.1z"
					fill="url(#cf-a)"
				/>
				<path
					d="M256 101.9c0-20.1-16.3-36.5-36.5-36.5-8.1 0-15.6 2.7-21.7 7.2.8-3.8 1.2-7.8 1.2-11.8C199 27.2 171.8 0 138.2 0c-26.7 0-49.4 17.3-57.6 41.2-4.6-3.4-10.2-5.5-16.4-5.5-15.1 0-27.3 12.2-27.3 27.3 0 2.3.3 4.6.8 6.8-20.9.7-37.7 17.9-37.7 39 0 2.5.2 4.9.7 7.2h252.5c1.8-4.4 2.8-9.1 2.8-14.1z"
					fill="#F68B1F"
				/>
				<path
					d="M191.8 60.8c0 29.6-24.1 48.3-53.7 48.3S84.6 90.4 84.6 60.8c0-29.6 24-53.6 53.6-53.6s53.6 24 53.6 53.6"
					fill="url(#cf-b)"
				/>
				<path
					d="M183.6 61.1c0 18.1-20.5 32.8-45.7 32.8-25.3 0-45.7-14.7-45.7-32.8 0-18.1 20.5-32.8 45.7-32.8 25.3.1 45.7 14.7 45.7 32.8"
					fill="#F68B1F"
				/>
				<circle fill="url(#cf-c)" cx="64.4" cy="63.2" r="20.3" />
				<path
					d="M80.8 55.5c3.4 5.9-.9 14.9-9.6 19.9-8.7 5-18.6 4.3-22-1.6-3.4-5.9.9-14.9 9.6-19.9 8.8-5.1 18.6-4.3 22 1.6"
					fill="#F68B1F"
				/>
				<path
					d="M70.8 108.7c0-17.6-14.3-31.9-31.9-31.9C21.3 76.8 7 91.1 7 108.7v.2h63.8v-.2z"
					fill="url(#cf-d)"
				/>
				<path
					d="M248.9 101.6c0-16.1-13-29.1-29.1-29.1s-29.1 13-29.1 29.1c0 2.3.3 4.5.8 6.6h56.7c.5-2.2.7-4.4.7-6.6z"
					fill="url(#cf-e)"
				/>
				<path
					d="M250.2 109.2l-1.1-2.2-1.2-2-1.7-2.6-1.7-2.2-2-2.5-2.1-2.2-2.4-2.3-2.2-1.9-2.6-1.8-2.5-1.5-2.8-1.6-2.3-1.2-2.4-1-2.2-.6-2.2-.4-2.1-.4-2.6-.2-164.9.3-2.6.1-2.7.2-2.9.3-2.4.5-3.1.7-2.1.7-2.3.9-2.3.8-2.9 1.5-2.1 1-2.8 1.8-2.5 2-2.7 2.1-2.3 2.3-1.8 2.2-1.9 2.5-1.4 2.5-1.1 2.2-.6 2-.4 1.7h244.6l-.7-1.7z"
					fill="url(#cf-f)"
				/>
				<path
					d="M202.6 67.8l22.1 28.9-.8.6-25.8-23.2-99.1 18-.1-.9L191 70l-50.7-17.2.6-.8 61.7 15.8z"
					fill="url(#cf-g)"
				/>
			</svg>
		),
	},
} satisfies Record<SupportedIntegrationKind, IntegrationMeta>;

export type { SupportedIntegrationKind };

export const supportedIntegrationTypes = Object.keys(
	INTEGRATIONS,
) as SupportedIntegrationKind[];
