const {
  NAME = 'arguman',
  KAFKA_ADDRESS = 'tcp://kafka:9092',
  OUTPUT_TOPIC = 'quad_update_requests'
} = process.env;

const memux = require('memux');
const fetch = require('node-fetch');
const PQueue = require('p-queue');
const jsonld = require('jsonld').promises;

const { send } = memux({
  name: NAME,
  url: KAFKA_ADDRESS,
  output: OUTPUT_TOPIC
});

const queue = new PQueue({
  concurrency: 1
});

var context = {
  'type': '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>',
  'name': '<http://schema.org/name>',
  'text': '<http://schema.org/text>',
  'url': '<http://schema.org/url>',
  'author': '<http://schema.org/author>',
  'citation': '<http://schema.org/citation>',
  'CreativeWork': '<http://schema.org/CreativeWork>',
  'Person': '<http://schema.org/Person>',
  'ReadAction': '<http://schema.org/ReadAction>',
  'WriteAction': '<http://schema.org/WriteAction>'
};

function flatten(array) {
  return array.reduce((memo, item) => {
    return [...memo, ...item];
  }, []);
}

function argumentId(id) {
  return `<arguman.org/argument/${ id }>`;
}

function premiseId(id) {
  return `<arguman.org/premise/${ id }>`;
}

function userId(id) {
  return `<arguman.org/user/${ id }>`;
}

function transformArgument(argument) {
  const aid = argumentId(argument.id);
  const uid = userId(argument.user.id);

  function transformUser(user) {
    const uid = userId(user.id);

    return [[uid, context['name'], user.username], [uid, context['type'], context['Person']]];
  }

  function transformPremise(premise) {
    const pid = premiseId(premise.id);
    const uid = userId(premise.user.id);
    const cid = premise.parent === null ? aid : premiseId(premise.parent);

    return [[pid, context['citation'], cid], [pid, context['author'], uid], [pid, context['text'], premise.text], ...transformUser(premise.user)];
  }

  return [[aid, context['type'], context['CreativeWork']], [aid, context['author'], uid], [aid, context['text'], argument.title], ...transformUser(argument.user), ...flatten(argument.premises.map(transformPremise))];
}

function getPage(pageUrl) {
  return queue.add(() => fetch(pageUrl)).then(response => response.json()).then(page => {
    const nextPageUrl = page.next;

    const quads = flatten(page.results.map(transformArgument));

    Promise.all(quads.map(([subject, predicate, object]) => send({ type: 'write', quad: { subject, predicate, object } }))).then(() => console.log(pageUrl));

    return nextPageUrl ? getPage(nextPageUrl) : null;
  });
}

getPage('http://arguman.org/api/v1/arguments/').catch(console.error);