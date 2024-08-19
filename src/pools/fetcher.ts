// ============ Internal Imports ============
import { Pool } from "../types/pool";

// ============ Config Imports ============
import pools from "./pools.config.json";

export abstract class PoolFetcher {
    static async getAllPools(): Promise<Pool[]> {
        // TODO: We want to take an indexer endpoint and fetch all pools.
        // Right now let us just reply using a config.
        return pools as Pool[] as Pool[];
    }
}
