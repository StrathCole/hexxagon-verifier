# Verifier for Hexxagon deployments

This tool is meant to verify deployments and published apps from Hexxagon against the public GitHub repository.

## Prerequisites

To run this tool you need NodeJS and a personal GitHub token.

To get a token, go to your GitHub account Settings -> Developer Settings -> Personal Access Tokens  
https://github.com/settings/tokens

Create a token with only "public_repo" privilege.

## Installation

Clone this repository to a private location on your server.

`git clone https://github.com/StrathCole/hexxagon-verifier.git`

Install the necessary node modules.

`cd hexxagon-verifier`  
`npm i`  

If you want to have the website part also, build the verifier-page.

`cd verify-page`  
`npm i`  
`npm run build`

Copy the contents of the build folder to a web directory (e.g. `/var/www/verifier/html/`) and configure your Nginx or Apache webserver accordingly. The verifier does only need static content, no PHP etc.

## Set up

You now can set up the cron job to actually update the status of the verifier.

Create a bash file to run the verifier, e.g. `/home/myuser/hexx-verify.sh`:

```bash
#!/bin/sh

export GITHUB_TOKEN=yourtokenfromgithub

node /home/myuser/hexxagon-verifier/verify.js /var/www/verifier/html/result.json

unset GITHUB_TOKEN
```

Make the file executable:  
`chmod 700 /home/myuser/hexx-verify.sh`

Create a cronjob with `sudo nano /etc/cron.d/verifier` and add the content:  
`*/30 * * * * myuser /home/myuser/hexx-verify.sh`

Make sure that `myuser` has write access to `/var/www/verifier/html/result.json`.