# album-generator

## Publish your own album to Heroku in 5 minutes (Mac)

Sign up and install Heroku tool: https://devcenter.heroku.com/articles/quickstart

Open _Terminal_ (It looks professional, but don't be afraid, you won't break you system!)

Install _brew_

    ruby -e "$(curl -fsSkL raw.github.com/mxcl/homebrew/go)"

Install necessory tools: node, imagemagick and exiftool

    brew install node imagemagick exiftool

Get our source code.

    git clone git://github.com/kk1fff/album-generator.git

Copy your image folder into _input/_ folder.

    cd album-generator
    mkdir input
    cd input
    cp -R ~/Picture/2013-01-02-Jack-wedding ./

Generate configure file

    ../../album-json-generator.sh

Generate album

    cd ..
    node main.js

Create a Heroku app. The app URL will be shown right after you pressed
enter. This is your album url

    heroku create

Deploy!

    git add output
    git commit -m 'Add album'
    git push heroku master

View your album on the Internet.
    
----------

I really like flickr, an album site that I can show my photos. But, it is less
customizable. I cannot add my own adsense on that, and it gives me just 300MB
traffic per month.

Everybody should able to own his/her own album site, so I wrote this album
generator. It supports EXIF, so you can show your parameter to other people.
It is very simple, so you don't need to learn much about how to use it.

## Installation

The installation process is quite simple. We will need node.js, imagemagick
and exiftool in your computer. If you are using Mac or Linux, brew and apt-get
may help you.

    brew install node imagemagick exiftool

Or on ubuntu:

    sudo apt-get install node imagemagick git exiftool

Then get this repository

    git clone git://github.com/kk1fff/album-generator.git

The installation process is done.

## Prepare source

album-generator generate album from a __input__ directory, the directory is
expected to be:

    (input dir root)
     |
     +- album1 (we don't care name of the folder, just name whatever you want)
     |   |
     |   +- DSC_5471.JPG
     |   |
     |   +- DSC_5472.JPG
     |   |
     .   .
     |   |
     |   +- album.json
     |
     +- album2
         |
         +- ...JPG
         |
         .
         |
         +- album.json

As you may see, we organize album by folder, but name of the folder doesn't
really matter. We name the album in __album.json__.

__album.json__ is a file that describes the album. If it isn't present, the
folder will not be recognized as a album. __album.json__ should contant
following entry:

    {
        "title": "My album",
        "desc": "I take these photos in Taipei, a lovely city",
        "name": "my-first-album",
        "sortcode": 3,
        "photos": [
            {
                "file": "DSC_5044.JPG",
                "title": "Taipei 101",
                "desc": "Taipei 101, once the tallest building in the world"
            },
            {
                "file": "DSC_5045.JPG",
                "title": "MRT station",
                "desc": "Metro transportation system in Taipei"
            }
        ]
    }

This file names the album, and put description on that. For each photo,
it *must* be listed in "photos" entry. If a photo is not specified in the
array, it will not be shown in result page.

Currently, the input directory have to be put in the folder of source, the
directory tree will look like:

    (album-generator roor)
     |
     +- main.js
     |
     +- templates/
     |
     .
     .
     |
     +- input/
         |
         +- album1/
         |
         +- album2/

then produce your album by

    node main.js

the result site will be put in __output/__ folder.

## License

Apache License 2.0
