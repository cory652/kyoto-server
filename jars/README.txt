Kyoto jars for the launcher.

Jar under 25 MB: put it here as kyoto-<minecraft version>.jar (e.g. kyoto-26.3.jar).

Jar over 25 MB (GitHub won't take it here): upload it to a GitHub Release instead, then put its link in links.json:
  { "26.3": { "url": "https://github.com/NAME/kyoto-server/releases/download/v6.3.0/kyoto-26.3.jar", "version": "6.3.0" } }
Change "version" every update so launchers know to download the new jar.
