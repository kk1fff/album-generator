#/bin/bash

DIRNAME=${PWD##*/}
FIRSTLINE=1

cat<<EOF > album.json
{
  "title": "$DIRNAME",
  "desc": "",
  "name": "_$DIRNAME",
  "sortcode": -1,
  "photos:": [
EOF

for i in `ls *.[Jj][Pp][Gg]`; do
    if [ $FIRSTLINE -eq 0 ]; then
        echo "," >> album.json
    fi
    FIRSTLINE=0
cat<<EOF >> album.json
    {
      "file": "$i",
      "title": "",
      "desc": ""
    }
EOF
done

cat<<EOF >> album.json
  ]
}
EOF