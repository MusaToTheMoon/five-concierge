/** Shared shapes for the RAG pipeline and API responses. */

/** One embedded chunk of the content corpus, as stored in data/embeddings.json. */
export interface EmbeddedChunk {
  id: string;
  title: string;
  source_url: string;
  category: string;
  text: string;
  embedding: number[];
}

/** The on-disk shape of data/embeddings.json. */
export interface EmbeddingStore {
  model: string;
  dimensions: number;
  createdAt: string;
  chunks: EmbeddedChunk[];
}

/** A cited source page shown under answers. */
export interface Source {
  title: string;
  url: string;
}

/** One chat turn exchanged with /api/chat. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

/** One stop in a generated itinerary. */
export interface ItineraryStop {
  time: string;
  venue: string;
  property: string;
  blurb: string;
  category: string;
  source: Source | null;
}

/** The response shape of /api/itinerary. */
export interface Itinerary {
  title: string;
  subtitle: string;
  stops: ItineraryStop[];
}
