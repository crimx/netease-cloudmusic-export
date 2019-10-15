const etags = require("./etags.json");
const fs = require("fs").promises;
const path = require("path");

module.exports = axios => {
  axios.interceptors.request.use(config => {
    if (etags[config.url]) {
      config.headers.common["If-None-Match"] = etags[config.url];
    }
    return config;
  });

  axios.interceptors.response.use(
    response => {
      const { url } = response.config;
      const { etag } = response.headers;

      if (etag && etags[url] !== etag) {
        etags[url] = etag;
        fs.writeFile(
          path.join(__dirname, "etags.json"),
          JSON.stringify(etags, null, "  ")
        );
      }

      return response;
    },
    error => {
      if (!error.response || error.response.status !== 304) {
        return Promise.reject(error);
      }
    }
  );
};
