# netease-cloudmusic-export
导出个人所有云音乐歌单

## 安装

```
git clone git@github.com:crimx/netease-cloudmusic-export.git
cd netease-cloudmusic-export
yarn install
```

项目根添加 `.env` 文件，补上手机号和密码。如果需要其它登录方式自行修改源码。

```
BASE_URL=http://localhost:3000

DELAY=1000

PHONE=
PASSWORD=

```

## 运行

先运行 [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)

本项目根执行

```
node index
```

## 导出内容解释

- `playlist.json` 所有的歌单信息，包括收藏的。
- `song.json` 所有个人歌单合并起来的全部歌曲详细信息。
  ```
  {
    [SongId]: SongInfo
  }
  ```
- `playlist/<PlaylistId>.json` 歌单详细信息。注意 `tracks` 受 1000 上限限制，`trackIds` 是完整的。故歌曲信息应该通过 `trackIds` 往 `songs.json` 中查询。
