import fs from "fs";
import path from "path";

/**
 * Write Soularr config.ini with Lidarr and Slskd API keys
 */
export async function writeSoularrConfig(
    lidarrApiKey: string,
    slskdApiKey: string
): Promise<void> {
    const configPath = path.resolve(
        process.cwd(),
        "..",
        "soularr",
        "config.ini"
    );

    const configContent = `[Lidarr]
# Get from Lidarr: Settings > General > Security > API Key
api_key = ${lidarrApiKey}
# URL Lidarr uses (Docker service name)
host_url = http://lidify_lidarr:8686
# Path to slskd downloads as Lidarr sees it
download_dir = /music/Soulseek
# If true, Lidarr won't auto-import from Slskd
disable_sync = False

[Slskd]
# Create in Slskd Web UI: Settings > Authentication > API Keys
api_key = ${slskdApiKey}
# URL Slskd uses (Docker service name)
host_url = http://lidify_slskd:5030
url_base = /
# Download path inside Slskd container
download_dir = /downloads
# Delete search history after Soularr runs
delete_searches = False
# Max seconds to wait for downloads (1 hour)
stalled_timeout = 3600

[Release Settings]
# Pick release with most common track count
use_most_common_tracknum = True
allow_multi_disc = True
# Accepted release countries (broad list for more results)
accepted_countries = Europe,Japan,United Kingdom,United States,[Worldwide],Australia,Canada,Germany,France,Italy,Netherlands,Sweden,Norway,Denmark
# Don't check the region of the release
skip_region_check = False
# Accepted formats
accepted_formats = CD,Digital Media,Vinyl

[Search Settings]
search_timeout = 5000
maximum_peer_queue = 50
# Minimum upload speed (0 = no minimum)
minimum_peer_upload_speed = 0
# Minimum match ratio between Lidarr track and Soulseek filename
# Lower = more lenient matching
minimum_filename_match_ratio = 0.75
# Preferred file types and qualities (most to least preferred)
# Prioritize FLAC, then high-quality MP3
allowed_filetypes = flac 24/192,flac 24/96,flac 16/44.1,flac,mp3 320,mp3 256,mp3
# Ignore these users (add problematic users here)
ignored_users = 
# Search for tracks if album search fails
search_for_tracks = True
# Prepend artist name when searching
album_prepend_artist = True
track_prepend_artist = True
# Search mode: "all", "incrementing_page", or "first_page"
# "incrementing_page" is recommended for efficiency
search_type = incrementing_page
# Albums to process per run (every 5 minutes = ~15 albums)
number_of_albums_to_grab = 15
# Unmonitor album on failure and log to failure_list.txt
remove_wanted_on_failure = False
# Blacklist words in album or track titles (case-insensitive)
# Example: title_blacklist = remix,live,karaoke
title_blacklist = 
# Lidarr search source: "missing" or "cutoff_unmet"
# "missing" focuses on completely missing albums
search_source = missing
# Enable search denylist to skip albums that repeatedly fail
enable_search_denylist = True
# Number of consecutive search failures before denylisting
max_search_failures = 5

[Logging]
level = INFO
format = [%(levelname)s|%(module)s|L%(lineno)d] %(asctime)s: %(message)s
datefmt = %Y-%m-%dT%H:%M:%S%z
`;

    try {
        fs.writeFileSync(configPath, configContent, "utf-8");
        console.log("Soularr config.ini updated");
    } catch (error: any) {
        console.error("Failed to write Soularr config.ini:", error.message);
        throw error;
    }
}
