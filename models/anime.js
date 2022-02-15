// mongoose model for anime

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var AnimeSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    titleType: {
        type: String,
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    plotSummary: {
        type: String,
    },
    totalEpisodes: {
        type: Number,
    },
    crawledEpisodes: {
        type: Number,
    },
    genres: [{ type: String }],
    isCompleted: {
        type: Boolean,
    },
    altNames: [{ type: String }],
    releasedYear: {
        type: Number,
    },
    episodes: [{
        _id: false,
        epNum: {
            type: Number,
            required: true
        },
        streamServers: [{
            _id: false,
            name: {
                type: String,
                required: true
            },
            iframe: {
                type: String,
                required: true
            }
        }],
    }],
    isDubbed: {
        type: Boolean,
    },
    lastUpdated: {
        type: Date,
    },

});

var Anime = mongoose.model('Anime', AnimeSchema);

module.exports = Anime;