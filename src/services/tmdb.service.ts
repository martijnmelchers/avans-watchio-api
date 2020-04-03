import fetch from 'node-fetch';
import DateTimeFormat = Intl.DateTimeFormat;

export interface TmdbItem {
    id: number;
    vote_count: number;
    popularity: number;
    title: string;
    release_data: DateTimeFormat;
    media_type: string;
}

export interface TmdbResult {
    page: number;
    total_results: number;
    total_pages: number;
    results: TmdbItem[];
}


export  class TmdbService{
    private static endpoint: string = 'https://api.themoviedb.org/3';
    public static searchItems(itemName: string): Promise<TmdbResult>{
        return new Promise<any>(async (resolve, reject) => {
            let params = new URLSearchParams("?api_key=placeholder");
            params.set('api_key', process.env.TMDB_API_KEY_V3 ? process.env.TMDB_API_KEY_V3 : "");
            params.append('query', itemName);
            params.append('page', '1');


            let url = `${TmdbService.endpoint}/search/multi?${params.toString()}`;

            const response =await fetch(url);

            resolve(await response.json() as TmdbResult);
        });
    }
}
