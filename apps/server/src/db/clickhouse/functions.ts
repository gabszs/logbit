/**
 * Typed wrappers para funções ClickHouse-específicas.
 *
 * Cada função retorna RawBuilder<T>, que implementa Expression<T>.
 * Isso permite usá-las em qualquer posição do Kysely que aceite o tipo T:
 *
 *   .where('Timestamp', '>=', fromUnixMs(1234))   // RawBuilder<string> compat com CHDateTime64
 *   .select(toStartOfInterval('Timestamp', 15))    // RawBuilder<string> como coluna
 */

import type { Expression, RawBuilder } from "kysely";
import { sql } from "kysely";

// ---------------------------------------------------------------------------
// DateTime
// ---------------------------------------------------------------------------

/**
 * fromUnixTimestamp64Milli(ms)
 * Converte Unix timestamp em milissegundos para DateTime64.
 * Compatível com colunas DateTime64 em WHERE, SELECT, ORDER BY.
 */
export const fromUnixMs = (ms: number | bigint): RawBuilder<string> =>
	sql`fromUnixTimestamp64Milli(${sql.lit(Number(ms))})`;

/**
 * toDateTime(expr)
 * Converte DateTime64 para DateTime (precisão de segundo).
 */
export const toDateTime = (expr: Expression<string>): RawBuilder<string> =>
	sql`toDateTime(${expr})`;

/**
 * toDate(expr)
 * Extrai a data (sem hora) de uma expressão DateTime.
 */
export const toDate = (expr: Expression<string>): RawBuilder<string> =>
	sql`toDate(${expr})`;

/**
 * toStartOfInterval(col, intervalSeconds)
 * Agrupa timestamps em buckets de N segundos.
 *
 * @example
 * .select(toStartOfInterval('Timestamp', 15).as('bucket'))
 * .groupBy('bucket')
 */
export const toStartOfInterval = (
	col: Expression<string> | string,
	intervalSeconds: number,
): RawBuilder<string> => {
	const expr = typeof col === "string" ? sql.ref<string>(col) : col;
	return sql`toStartOfInterval(toDateTime(${expr}), INTERVAL ${sql.raw(String(intervalSeconds))} second)`;
};

/**
 * toStartOfMinute / Hour / Day — atalhos comuns
 */
export const toStartOfMinute = (
	col: Expression<string> | string,
): RawBuilder<string> => toStartOfInterval(col, 60);

export const toStartOfHour = (
	col: Expression<string> | string,
): RawBuilder<string> => toStartOfInterval(col, 3600);

/**
 * now64()
 * Timestamp atual com precisão de nanosegundo.
 */
export const now64 = (): RawBuilder<string> => sql`now64()`;

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

/** count() */
export const count = (): RawBuilder<number> => sql`count()`;

/** countIf(condition) */
export const countIf = (condition: Expression<unknown>): RawBuilder<number> =>
	sql`countIf(${condition})`;

/** uniq(col) — aproximado, mais rápido que count(distinct) */
export const uniq = (col: Expression<unknown>): RawBuilder<number> =>
	sql`uniq(${col})`;

/** uniqExact(col) — count distinct exato */
export const uniqExact = (col: Expression<unknown>): RawBuilder<number> =>
	sql`uniqExact(${col})`;

/** quantile(level)(col) — ex: quantile(0.95)(Duration) */
export const quantile = (
	level: number,
	col: Expression<number>,
): RawBuilder<number> => sql`quantile(${sql.lit(level)})(${col})`;

/** avg(col) */
export const avg = (col: Expression<number>): RawBuilder<number> =>
	sql`avg(${col})`;

/** sum(col) */
export const sum = (col: Expression<number>): RawBuilder<number> =>
	sql`sum(${col})`;

/** min(col) */
export const min = <T>(col: Expression<T>): RawBuilder<T> => sql`min(${col})`;

/** max(col) */
export const max = <T>(col: Expression<T>): RawBuilder<T> => sql`max(${col})`;

// ---------------------------------------------------------------------------
// String / Array
// ---------------------------------------------------------------------------

/**
 * has(array_col, value)
 * Verifica se um Array contém um valor — útil para *AttributesKeys.
 */
export const has = (
	arrayCol: Expression<string[]>,
	value: string,
): RawBuilder<number> => sql`has(${arrayCol}, ${sql.lit(value)})`;

/**
 * arrayJoin(array_col)
 * "Explode" um array em múltiplas linhas.
 */
export const arrayJoin = (arrayCol: Expression<string[]>): RawBuilder<string> =>
	sql`arrayJoin(${arrayCol})`;

/**
 * Acessa uma sub-coluna do tipo JSON nativo do ClickHouse.
 * ex: jsonSubCol<string>('ResourceAttributes', 'service_name')
 * → `ResourceAttributes.service_name`
 */
export const jsonSubCol = <T = unknown>(
	column: string,
	path: string,
): RawBuilder<T> => sql`${sql.ref(column)}.${sql.raw(path)}` as RawBuilder<T>;

// ---------------------------------------------------------------------------
// Condicionais
// ---------------------------------------------------------------------------

/**
 * if(condition, then, else)
 */
export const chIf = <T>(
	condition: Expression<unknown>,
	then: Expression<T>,
	otherwise: Expression<T>,
): RawBuilder<T> =>
	sql`if(${condition}, ${then}, ${otherwise})` as RawBuilder<T>;

/**
 * multiIf(cond1, val1, cond2, val2, ..., default)
 * Passa as expressões em ordem: [cond, val, cond, val, ..., default]
 */
export const multiIf = <T>(...args: Expression<unknown>[]): RawBuilder<T> => {
	const parts = args.map((a, i) =>
		i < args.length - 1 ? sql`${a}, ` : sql`${a}`,
	);
	return sql`multiIf(${sql.join(parts, sql``)})` as RawBuilder<T>;
};
