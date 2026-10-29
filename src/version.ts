import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

const REPO = process.env.CLIENT_REPO ?? 'ferrosa-game/Ferrosa';

const PLATFORMS = ['windows-x64', 'linux-x64', 'macos-arm64'] as const;

type Manifest = {
    version: string;
    url: string;
    sha256: string;
    size: number;
};

type GithubRelease = {
    tag_name: string;
    assets: { name: string; size: number; digest: string | null; browser_download_url: string }[];
};

let cache: { at: number; release: GithubRelease } | undefined;

async function latestRelease() {
    if (cache && Date.now() - cache.at < 60_000 * 5) {
        return cache.release;
    }

    const headers: Record<string, string> = { accept: 'application/vnd.github+json' };

    if (process.env.GITHUB_TOKEN) {
        headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers });

    if (!response.ok) {
        if (cache) {
            return cache.release;
        }

        throw Object.assign(new Error('upstream release lookup failed'), { statusCode: 502 });
    }

    const release = await response.json() as GithubRelease;
    cache = { at: Date.now(), release };

    return release;
}

export const versionRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
    fastify.get('/version', {
        schema: {
            querystring: Type.Object({
                platform: Type.Union(PLATFORMS.map((name) => Type.Literal(name)))
            })
        }
    }, async (req): Promise<Manifest> => {
        const release = await latestRelease();
        const asset = release.assets.find((candidate) => candidate.name === `ferrosa-${req.query.platform}.zip`);

        if (!asset) {
            throw Object.assign(new Error('no build for that platform'), { statusCode: 404 });
        }

        if (!asset.digest?.startsWith('sha256:')) {
            throw Object.assign(new Error('upstream asset has no sha256 digest'), { statusCode: 502 });
        }

        return {
            version: release.tag_name,
            url: asset.browser_download_url,
            sha256: asset.digest.slice('sha256:'.length),
            size: asset.size
        };
    });
};
