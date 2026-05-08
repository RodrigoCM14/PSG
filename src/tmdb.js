import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w342";

export async function loadTmdbConfig(rootDir) {
  const config = {
    readToken: process.env.TMDB_READ_TOKEN || process.env.TMDB_TOKEN || "",
    apiKey: process.env.TMDB_API_KEY || ""
  };

  try {
    const raw = await readFile(join(rootDir, "data", "tmdb.local.json"), "utf8");
    const local = JSON.parse(raw.replace(/^\uFEFF/, ""));
    return {
      readToken: config.readToken || local.readToken || local.token || "",
      apiKey: config.apiKey || local.apiKey || ""
    };
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`No pude leer tmdb.local.json: ${error.message}`);
    return config;
  }
}

export async function enrichMediaInput(input, listCategory, config) {
  const mediaType = mediaTypeForCategory(listCategory);
  if (!mediaType || !hasCredentials(config) || input.tmdbId) return input;

  const title = String(input.title || "").trim();
  if (!title) return input;

  const match = await searchBestMatch(title, mediaType, config);
  if (!match) return input;

  const details = await fetchDetails(match.id, mediaType, config);
  if (!details) return input;

  return mergeMediaMetadata(input, mediaType, match, details);
}

export function mergeMediaMetadata(input, mediaType, match, details) {
  const year = dateYear(details.release_date || details.first_air_date || match.release_date || match.first_air_date);
  const productionCompanies = (details.production_companies || []).map((item) => item.name).filter(Boolean);
  const director = mediaType === "movie"
    ? (details.credits?.crew || []).find((person) => person.job === "Director")?.name || ""
    : "";
  const creators = mediaType === "tv" ? (details.created_by || []).map((person) => person.name).filter(Boolean) : [];

  return {
    ...input,
    title: details.title || details.name || match.title || match.name || input.title,
    tmdbId: details.id || match.id,
    tmdbType: mediaType,
    originalTitle: details.original_title || details.original_name || match.original_title || match.original_name || "",
    year,
    director,
    creator: creators.join(", "),
    productionCompanies,
    overview: details.overview || match.overview || "",
    posterPath: details.poster_path ? `${IMAGE_BASE_URL}${details.poster_path}` : "",
    tmdbUrl: details.id ? `https://www.themoviedb.org/${mediaType === "movie" ? "movie" : "tv"}/${details.id}` : ""
  };
}

function mediaTypeForCategory(category) {
  const normalized = String(category || "").toLowerCase();
  if (normalized === "peliculas") return "movie";
  if (normalized === "series") return "tv";
  return "";
}

function hasCredentials(config) {
  return Boolean(config?.readToken || config?.apiKey);
}

async function searchBestMatch(title, mediaType, config) {
  const url = new URL(`${BASE_URL}/search/${mediaType}`);
  url.searchParams.set("query", title);
  url.searchParams.set("language", "es-PE");
  url.searchParams.set("include_adult", "false");
  if (config.apiKey && !config.readToken) url.searchParams.set("api_key", config.apiKey);
  const payload = await tmdbFetch(url, config);
  return (payload.results || []).find((item) => item.id) || null;
}

async function fetchDetails(id, mediaType, config) {
  const url = new URL(`${BASE_URL}/${mediaType}/${id}`);
  url.searchParams.set("language", "es-PE");
  url.searchParams.set("append_to_response", mediaType === "movie" ? "credits" : "aggregate_credits");
  if (config.apiKey && !config.readToken) url.searchParams.set("api_key", config.apiKey);
  return tmdbFetch(url, config);
}

async function tmdbFetch(url, config) {
  const response = await fetch(url, {
    headers: config.readToken ? { Authorization: `Bearer ${config.readToken}` } : undefined
  });
  if (!response.ok) throw new Error(`TMDb respondio ${response.status}`);
  return response.json();
}

function dateYear(value) {
  const match = String(value || "").match(/^(\d{4})/);
  return match ? match[1] : "";
}
