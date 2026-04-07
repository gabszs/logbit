// src/tools/calculadora.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const calculadoraTool = createTool({
	id: "calculadora",
	description:
		"Realiza operações matemáticas básicas: soma, subtração, multiplicação e divisão.",
	inputSchema: z.object({
		operacao: z.enum(["soma", "subtracao", "multiplicacao", "divisao"]),
		a: z.number().describe("Primeiro número"),
		b: z.number().describe("Segundo número"),
	}),
	outputSchema: z.object({
		resultado: z.number(),
		expressao: z.string(),
	}),
	execute: async ({ context }) => {
		const { operacao, a, b } = context;

		const operacoes = {
			soma: { fn: () => a + b, simbolo: "+" },
			subtracao: { fn: () => a - b, simbolo: "-" },
			multiplicacao: { fn: () => a * b, simbolo: "*" },
			divisao: { fn: () => a / b, simbolo: "/" },
		};

		if (operacao === "divisao" && b === 0) {
			throw new Error("Divisão por zero não é permitida.");
		}

		const { fn, simbolo } = operacoes[operacao];
		const resultado = fn();

		return {
			resultado,
			expressao: `${a} ${simbolo} ${b} = ${resultado}`,
		};
	},
});

export const climaTool = createTool({
	id: "clima",
	description: "Busca a temperatura e condição climática atual de uma cidade.",
	inputSchema: z.object({
		cidade: z.string().describe("Nome da cidade, ex: São Paulo"),
	}),
	outputSchema: z.object({
		cidade: z.string(),
		temperatura: z.number(),
		condicao: z.string(),
		umidade: z.number(),
	}),
	execute: async ({ context }) => {
		const { cidade } = context;

		// Open-Meteo: gratuito, sem API key
		const geoRes = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt`,
		);
		const geoData = await geoRes.json();

		if (!geoData.results?.length) {
			throw new Error(`Cidade "${cidade}" não encontrada.`);
		}

		const { latitude, longitude, name } = geoData.results[0];

		const weatherRes = await fetch(
			`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
				"&current=temperature_2m,relative_humidity_2m,weather_code",
		);
		const weatherData = await weatherRes.json();
		const current = weatherData.current;

		const condicoes: Record<number, string> = {
			0: "Céu limpo",
			1: "Principalmente limpo",
			2: "Parcialmente nublado",
			3: "Nublado",
			45: "Neblina",
			61: "Chuva leve",
			63: "Chuva moderada",
			65: "Chuva forte",
			80: "Pancadas de chuva",
			95: "Tempestade",
		};

		return {
			cidade: name,
			temperatura: current.temperature_2m,
			condicao: condicoes[current.weather_code] ?? "Condição desconhecida",
			umidade: current.relative_humidity_2m,
		};
	},
});

export const textoTool = createTool({
	id: "analisar-texto",
	description:
		"Analisa um texto e retorna estatísticas: palavras, caracteres, frases e leitura estimada.",
	inputSchema: z.object({
		texto: z.string().describe("Texto a ser analisado"),
	}),
	outputSchema: z.object({
		palavras: z.number(),
		caracteres: z.number(),
		frases: z.number(),
		tempoLeituraSegundos: z.number(),
		resumo: z.string(),
	}),
	execute: async ({ context }) => {
		const { texto } = context;

		const palavras = texto.trim().split(/\s+/).length;
		const caracteres = texto.length;
		const frases = texto.split(/[.!?]+/).filter(Boolean).length;
		const tempoLeituraSegundos = Math.ceil((palavras / 200) * 60); // 200 palavras/min

		return {
			palavras,
			caracteres,
			frases,
			tempoLeituraSegundos,
			resumo: `${palavras} palavras, ${frases} frases, ~${tempoLeituraSegundos}s de leitura`,
		};
	},
});
