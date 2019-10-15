const querystring = require("querystring");
const cliProgress = require("cli-progress");
const path = require("path");
const _ = require("lodash");
const fse = require("fs-extra");
const axios = require("axios");
const { parsed: dotenv } = require("dotenv").config();

const progressBar = new cliProgress.SingleBar(
  {},
  cliProgress.Presets.shades_classic
);

axios.defaults.baseURL = dotenv.BASE_URL;

main().catch(console.log);

async function main() {
  const userId = await login();
  const playlists = await getPlaylist(userId);
  await storeSongsInfo(userId, playlists);
  await storePlaylistCover(userId, playlists);

  console.log(`\nDone.\n`);
}

async function login() {
  const { data, headers } = await axios({
    url: "/login/cellphone",
    method: "post",
    data: querystring.stringify({
      phone: dotenv.PHONE,
      password: dotenv.PASSWORD
    })
  });

  if (headers["set-cookie"]) {
    cookie = headers["set-cookie"]
      .map(c => (/^[^;]+/.exec(c) || [""])[0])
      .filter(Boolean)
      .join("; ");

    axios.interceptors.request.use(config => {
      if (cookie) {
        config.headers.common.Cookie = cookie;
      }
      return config;
    });
  } else {
    throw new Error("Cannot get cookie");
  }

  console.log(`\nLogin as "${data.profile.nickname}".\n`);

  return data.account.id;
}

async function getPlaylist(userId) {
  const { data } = await axios({
    url: `/user/playlist?uid=${userId}`,
    method: "GET"
  });
  if (!data) return;

  await fse.outputJson(
    path.join(__dirname, "data", `${userId}`, "playlist.json"),
    data
  );

  const playlists = data.playlist.filter(
    list => list.creator.userId === userId
  );

  console.log(`\nFetched ${playlists.length} playlists.\n`);

  return playlists;
}

/** All songs info */
async function storeSongsInfo(userId, playlists) {
  console.log(`\nDownload songs info...\n`);
  progressBar.start(playlists.length, 0);

  const songs = new Set();

  for (const playlist of playlists) {
    try {
      const { data } = await axios({
        url: `/playlist/detail?id=${playlist.id}`,
        method: "GET"
      });

      await fse.outputJson(
        path.join(
          __dirname,
          "data",
          `${userId}`,
          "playlist",
          `${playlist.id}.json`
        ),
        data
      );

      for (const trackId of data.playlist.trackIds) {
        songs.add(trackId.id);
      }
    } catch (e) {
      console.error(`\nPlaylist failed: ${playlist.id} ${playlist.name}\n`);
    }

    progressBar.increment();
    await timer(dotenv.DELAY);
  }

  const chunks = _.chunk([...songs], 1000);

  const songsData = {};

  for (const chunk of chunks) {
    const { data } = await axios({
      url: `/song/detail`,
      method: "POST",
      data: `ids=${chunk.join(",")}`
    });

    for (const song of data.songs) {
      songsData[song.id] = song;
    }
  }

  await fse.outputJson(
    path.join(__dirname, "data", `${userId}`, "songs.json"),
    songsData
  );

  progressBar.stop();
}

async function storePlaylistCover(userId, playlists) {
  console.log(`\nDownload playlist cover...\n`);
  progressBar.start(playlists.length, 0);

  for (const playlist of playlists) {
    try {
      const { data } = await axios({
        url: playlist.coverImgUrl,
        method: "GET",
        responseType: "stream"
      });

      data.pipe(
        fse.createWriteStream(
          path.join(
            __dirname,
            "data",
            `${userId}`,
            "playlist",
            `${playlist.id}.jpg`
          )
        )
      );
    } catch (e) {
      console.error(
        `\nFailed to download playlist cover: ${playlist.id} ${playlist.name}\n`
      );
    }

    progressBar.increment();
    await timer(dotenv.DELAY);
  }

  progressBar.stop();
}

function timer(ms = 0) {
  return new Promise(resolve => {
    setTimeout(resolve, Number(ms));
  });
}
