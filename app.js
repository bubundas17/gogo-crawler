const cheerio = require('cheerio');
const axios = require('axios');
const mongoose = require('mongoose');
const Anime = require('./models/anime');
const async = require("async");
const fs = require('fs');

// connect to mongoose
mongoose.connect('mongodb://localhost/anime');
// on connection
mongoose.connection.once('open', () => {
    console.log('connected to mongodb');
    runProcess()
});
const CliProgress = require('cli-progress');
const bar1 = new CliProgress.Bar({
    etaBuffer: 5000,
    format: '[{bar}] {percentage}% | ETA: {eta_formatted} | {value}/{total}'
}, CliProgress.Presets.shades_grey);

async function runProcess() {
    // await getAllAnimeList();
    // getAnimeDetails('naruto').then(console.log);
    // await scrapePages();
    await getStreamLinks();
    // getStreamingLinks('gintama-dub-episode-49').then(console.log);


}

// scrape anime episode pages
const scrapePages = async () => {
    return new Promise(async (resolve, reject) => {
        documents = await Anime.find({ titleType: null }).count();
        let corsor = Anime.find({ titleType: null }).lean().cursor();
        let count = 0;
        // each async 
        corsor.eachAsync(async (doc) => {
            count++;
            bar1.start(documents, count);
            // scrape anime details page
            let data = await getAnimeDetails(doc.slug);
            // update db
            Anime.update({ slug: doc.slug }, { ...data }, (err, res) => {
                if (err) {
                    console.log(err);
                }
            });

        }, { parallel: 100 }).then(() => {
            bar1.stop();
            console.log('done');
        });

        corsor.on('end', () => {
            resolve();
        });
    });
}


// scrape stream links 
const getStreamLinks = async () => {
    return new Promise(async (resolve, reject) => {
        let totalPages = 78;
        let count = 0;
        let documents = await Anime.find({ $expr: { $ne: ["$totalEpisodes", "$crawledEpisodes"] }, titleType: { $ne: null } }).count();
        let corsor = Anime.find({ $expr: { $ne: ["$totalEpisodes", "$crawledEpisodes"] }, titleType: { $ne: null } }).lean().cursor();
        corsor.eachAsync(async (doc) => {
            // console.log(doc);
            count++;
            bar1.start(documents, count);
            let episodeLinks = await getAllEpisodes(doc.slug, doc.totalEpisodes);
            // console.log(episodeLinks);
            return await Anime.update({ slug: doc.slug }, { $set: { episodes: episodeLinks, crawledEpisodes: episodeLinks.length } });
        }, { parallel: 5 }).then(() => {
            bar1.stop();
            console.log('done');
        });
        corsor.on('end', () => {
            resolve();
        });
    });
}

// download posters
const downloadPosters = async () => {
    return new Promise(async (resolve, reject) => {
        let totalPages = 78;
        let count = 0;
        let documents = await Anime.find({ titleType: { $ne: null } }).count();
        let corsor = Anime.find({ $ne: null }).lean().cursor();
        corsor.eachAsync(async (doc) => {
            // console.log(doc);
            count++;
            bar1.start(documents, count);
            
        }, { parallel: 5 }).then(() => {
            bar1.stop();
            console.log('done');
        });
        corsor.on('end', () => {
            resolve();
        });
    });
}


const URL_PREFIX = 'https://gogoanime.fi';

// get all anime list
const getAllAnimeList = async () => {
    return new Promise(async (resolve, reject) => {
        // let animeList = [];
        let totalPages = 78;

        for (let i = 1; i <= totalPages; i++) {
            const req = await axios.get(`${URL_PREFIX}/anime-list.html?page=${i}`);
            const $ = cheerio.load(req.data);
            // selector for anime list
            // .listing a
            $('.listing a').each((i, el) => {
                let anime = $(el).attr('href');
                // remove /category/ from the url
                anime = anime.replace('/category/', '');
                let name = $(el).text().trim();
                // if the name ends with "(Dub)" 
                let isDubbed = name.endsWith('(Dub)');
                // animeList.push({ slug: anime, title: name, isDubbed });
                Anime.update({ slug: anime }, { slug: anime, title: name, isDubbed }, { upsert: true }, (err, res) => {
                    if (err) {
                        console.log(err);
                    }
                    // console.log(res);
                });
                // log cwawling anime list
            });
            process.stdout.write(`page: ${i} of ${totalPages} done.\r`);
            resolve();
        }
    });
    // console.log(animeList);
    // return animeList;
}

// scrape anime details page
const getAnimeDetails = async (slug) => {
    const req = await axios.get(`${URL_PREFIX}/category/${slug}`);
    const $ = cheerio.load(req.data);
    /* selector for anime details
    / loop through p.type
    */
    let anime = {};
    $('p.type').each((i, el) => {
        let type = $(el).text().trim();
        // if begins with "Genre"
        if (type.startsWith('Genre:')) {
            // split by ","
            let genres = type.split(',');
            // remove "Genre"
            genres = genres.map(genre => genre.replace('Genre:', '').trim());
            anime.genres = genres;
        }
        // if begins with "Other name:"
        if (type.startsWith('Other name:')) {
            // split by ","
            let altNames = type.split(',');
            // remove "Other name:"
            altNames = altNames.map(altName => altName.replace('Other name:', '').trim());
            anime.altNames = altNames;
        }
        // if begins with "Released:"
        if (type.startsWith('Released:')) {
            // remove "Released:"
            let year = type.replace('Released:', '').trim();
            // number only
            year = parseInt(year) || null;
            anime.releasedYear = year;
        }
        // if begins with "Status:"
        if (type.startsWith('Status:')) {
            // remove "Status:"
            let status = type.replace('Status:', '').trim();
            // if status is "Completed"
            if (status === 'Completed') {
                anime.isCompleted = true;
            } else {
                anime.isCompleted = false;
            }
        }
        // if begins with "Plot Summary:"
        if (type.startsWith('Plot Summary:')) {
            // remove "Plot Summary:"
            let plotSummary = type.replace('Plot Summary:', '').trim();
            anime.plotSummary = plotSummary;
        }
        // if begins with "Type"
        if (type.startsWith('Type:')) {
            // if contains "Movie" them type = "Movie" or type = "Anime"
            if (type.includes('Movie')) {
                anime.titleType = 'Movie';
            } else {
                anime.titleType = 'Anime';
            }
        }
    });

    // h1 title
    anime.title = $('h1').text().trim();
    // total episodes
    /*
    / loop through #episode_page a
    / look for the largest "ep_end" attribute
    */
    let totalEpisodes = 0;
    $('#episode_page a').each((i, el) => {
        let ep = $(el).attr('ep_end');
        if (ep > totalEpisodes) {
            // int
            totalEpisodes = parseInt(ep) || null;
        }
    });
    anime.totalEpisodes = totalEpisodes;

    return anime;
}

// get streaming links
const getStreamingLinks = async (slug) => {
    const req = await axios.get(`${URL_PREFIX}/${slug}`);
    const $ = cheerio.load(req.data);
    const servers = [];
    $('div#wrapper_bg').each((index, element) => {
        const $element = $(element);
        $element.find('div.anime_muti_link ul li').each((j, el) => {
            const $el = $(el);
            const name = $el.find('a').text().substring(0, $el.find('a').text().lastIndexOf('C')).trim();
            let iframe = $el.find('a').attr('data-video');
            if (iframe.startsWith('//')) {
                iframe = $el.find('a').attr('data-video').slice(2);
            }
            // add https if not already in iframe 
            if (!iframe.startsWith('https')) {
                iframe = `https://${iframe}`;
            }
            // skip name if name contains Gogo server
            if (!name.includes('Gogo')) {
                servers.push({ name, iframe });
            }
        })
    })
    return servers
}

// fetch all episodes of an anime
const getAllEpisodes = async (slug, numEpisodes) => {
    return new Promise(async (resolve, reject) => {
        let episodes = [];
        for (let i = 1; i <= numEpisodes; i++) {
            episodes.push(i);
        }
        async.mapLimit(episodes, 10, async (index) => {
            let episodeSlug = `${slug}-episode-${index}`;
            let res = { epNum: index, streamServers: await getStreamingLinks(episodeSlug) };
            // console.log(res);
            return res;
        }, (err, results) => {
            if (err) {
                // console.log(err);
                resolve([]);
            }
            resolve(results);
        });
    });
}



// getAllAnimeList();
// getAnimeDetails('naruto').then(console.log);
// getStreamingLinks('gintama-dub-episode-49').then(console.log);