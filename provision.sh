#!/bin/bash

apt-key adv --keyserver pgp.mit.edu --recv-keys 1614552E5765227AEC39EFCFA7E00EF33A8F2399
apt-key adv --keyserver pgp.mit.edu --recv-keys 9FD3B784BC1C6FC31A8A0A1C1655A0AB68576280

echo 'deb http://download.rethinkdb.com/apt trusty main' > /etc/apt/sources.list.d/rethinkdb.list
echo 'deb https://deb.nodesource.com/node_6.x trusty main' > /etc/apt/sources.list.d/nodesource.list
echo 'deb-src https://deb.nodesource.com/node_6.x trusty main' >> /etc/apt/sources.list.d/nodesource.list

apt-get update
apt-get install -y rethinkdb nodejs

echo 'bind=all' > /etc/rethinkdb/instances.d/default.conf
echo 'cache-size=1024' >> /etc/rethinkdb/instances.d/default.conf

service rethinkdb start
