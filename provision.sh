#!/bin/bash

# postgres
apt-key adv --keyserver pgp.mit.edu --recv-keys B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8
echo "deb http://apt.postgresql.org/pub/repos/apt/ trusty-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# node
apt-key adv --keyserver pgp.mit.edu --recv-keys 9FD3B784BC1C6FC31A8A0A1C1655A0AB68576280
echo 'deb https://deb.nodesource.com/node_4.x trusty main' > /etc/apt/sources.list.d/nodesource.list

apt-get update
apt-get install -y nodejs \
  postgresql-9.5-postgis-2.2 postgresql-contrib-9.5 \
  postgresql-server-dev-9.5 postgresql-9.5-pgrouting \
  python-software-properties git build-essential \
  cmake expat libexpat1-dev libboost-all-dev \ # Needed to build osm2pgrouting

apt-get install -y --no-install-recommends osm2pgsql

su -c "psql -c \"CREATE ROLE uber UNENCRYPTED PASSWORD 'moo' SUPERUSER CREATEDB CREATEROLE INHERIT LOGIN;\"" postgres

PGPASSWORD=moo psql -U uber -h 127.0.0.1 postgres << EOF
CREATE DATABASE gis;
\connect gis;
CREATE EXTENSION postgis;
EOF

su -c "psql -c \"CREATE ROLE pgrouting UNENCRYPTED PASSWORD 'moo' SUPERUSER CREATEDB CREATEROLE INHERIT LOGIN;\"" postgres

PGPASSWORD=moo psql -U pgrouting -h 127.0.0.1 postgres << EOF
CREATE DATABASE 'pgrouting-workshop';
\connect pgrouting-workshop;
CREATE EXTENSION postgis;
CREATE EXTENSION pgrouting;
EOF

wget --quiet http://download.bbbike.org/osm/bbbike/NewYork/NewYork.osm.gz
gzip -d NewYork.osm.gz

PGPASSWORD=moo osm2pgsql -d gis -U uber -H 127.0.0.1 NewYork.osm

wget --quiet https://github.com/pgRouting/osm2pgrouting/archive/osm2pgrouting-2.1.0.tar.gz
tar -zxf osm2pgrouting-osm2pgrouting-2.1.0.tar.gz
cd osm2pgrouting-osm2pgrouting-2.1.0
cmake -H. -Bbuild
cd build/
make
make install
cd ~

osm2pgrouting --file NewYork.osm --conf /usr/share/osm2pgrouting/mapconfig.xml --dbname pgrouting-workshop --username pgrouting --password moo --host 127.0.0.1 --clean

