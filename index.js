const querystring = require("querystring");
const cliProgress = require("cli-progress");
const path = require("path");
const shell = require("shelljs");
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
  await pushGitRepo();

  console.log(`\nDone.\n`);
}

async function login() {
  if (!dotenv.PHONE || !dotenv.PASSWORD) {
    throw new Error("Missing phone number or password");
  }

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

  return playlists;
}

/** All songs info */
async function storeSongsInfo(userId, playlists) {
  console.log(`\nDownload ${playlists.length} playlist details...\n`);
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

  progressBar.stop();

  const chunks = _.chunk([...songs], 500);

  const songsData = {};

  console.log(
    `\nDownload ${songs.size} song details(in ${chunks.length} chunks)...\n`
  );
  progressBar.start(chunks.length, 0);

  for (const chunk of chunks) {
    const { data } = await axios({
      url: `/song/detail?ids=${chunk.join(",")}`,
      method: "GET"
    });

    for (const song of data.songs) {
      songsData[song.id] = song;
    }

    progressBar.increment();
    await timer(dotenv.DELAY);
  }

  progressBar.stop();

  await fse.outputJson(
    path.join(__dirname, "data", `${userId}`, "songs.json"),
    songsData
  );
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

async function pushGitRepo() {
  if (!dotenv.GIT_REPO) return;

  shell.cd(__dirname);

  if (await fse.pathExists(path.join(__dirname, "data", ".git"))) {
    shell.exec(`git -C data fetch`);
  } else {
    const temp = "temp" + Date.now();
    shell.exec(`git clone --no-checkout ${dotenv.GIT_REPO} ${temp}`);
    await fse.move(
      path.join(__dirname, temp, ".git"),
      path.join(__dirname, "data", ".git"),
      { overwrite: true }
    );
    await fse.rmdir(path.join(__dirname, temp));
  }

  shell.cd(path.join(__dirname, "data"));
  shell.exec(`git add --all`);
  shell.exec(`git commit -m"update playlist"`);
  shell.exec(`git push --verbose`);
}

function timer(ms = 0) {
  return new Promise(resolve => {
    setTimeout(resolve, Number(ms));
  });
}
