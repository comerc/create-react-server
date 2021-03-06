import fetch from "node-fetch";
import Express from "express";
import MemoryFileSystem from "memory-fs";
import React from "react";
import {createStore} from "redux";
import {Redirect, Route, withRouter} from "react-router";
import {connect} from "react-redux";
import {createExpressMiddleware} from "./index";
import {withWrapper} from "./wrapper";
import "./test";

// ------------------------------------------------------------------------------------------------------------------ //

jasmine.DEFAULT_TIMEOUT_INTERVAL = 5000;

// MAIN APP
let App = ({foo, custom}) => (<span>{foo + '|' + custom}</span>);
App.getInitialProps = ({store}) => {
    // DISPATCH ONLY HAPPENS IF STATE IS INITIAL
    if (store.getState().foo === 'initial') {
        store.dispatch({type: 'FOO', payload: 'dispatched'});
    }
    return {custom: 'initial'};
};
App = connect(state => state)(App);
App = withWrapper(App);

const reducer = (state = {foo: 'initial'}, {type, payload}) => {
    if (type === 'FOO') return {foo: payload};
    return state;
};

const makeStore = (initialState) => (createStore(reducer, initialState));

const makeRouter = () => (
    <Route path='/' getComponent={() => new Promise((res) => { setTimeout(() => res(App), 10); })}>
        <Redirect from="/redirect" to="/"/>
    </Route>
);

const template = '<html><head></head><body><div id="app"><!--html--></div></body></html>';

const simpleErrorTemplate = (error) => ('[' + error.code + ']:' + error.message);

const defaultOptions = {
    createRoutes: (history) => (makeRouter(history)),
    createStore: ({req, res}) => (makeStore()),
    templatePath: '/foo',
    outputPath: '/bar',
    template: ({template, html, error}) => {
        if (!!error) return simpleErrorTemplate(error);
        return template.replace('<!--html-->', html);
    },
    debug: false
};

const createOptions = (options = {}) => ({
    ...defaultOptions,
    fs: new MemoryFileSystem(),
    ...options
});

const serverTest = (options, test) => {
    return (new Promise((res) => {

        const app = Express();

        app.use(createExpressMiddleware(options));

        const server = app.listen(3333, () => {
            res(server);
        });

    })).then(async(server) => {

        try {
            await test(server);
            server.close();
        } catch (e) {
            server.close();
            throw e;
        }

    });
};

// ------------------------------------------------------------------------------------------------------------------ //

test('createExpressMiddleware e2e success', async() => {

    const options = createOptions();

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        const expected = (
            '<html><head>' +
            '<script type="text/javascript">window["__INITIAL__STATE__"] = {"foo":"dispatched"};</script>' +
            '<script type="text/javascript">window["__INITIAL__PROPS__"] = {"custom":"initial"};</script>' +
            '</head><body><div id="app">' +
            '<span data-reactroot="" data-reactid="1" data-react-checksum="289216439">dispatched|initial</span>' +
            '</div></body></html>'
        );

        expect(await (await fetch('http://localhost:3333/')).text()).toBe(expected);
        expect(await (await fetch('http://localhost:3333/redirect')).text()).toBe(expected);

    });

});

test('createExpressMiddleware e2e with initial state', async() => {

    const options = createOptions({
        createStore: ({req, res}) => (makeStore({foo: 'overridden'})), // no dispatch will happen, see condition
    });

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        expect(await (await fetch('http://localhost:3333/')).text())
            .toBe(
                '<html><head>' +
                '<script type="text/javascript">window["__INITIAL__STATE__"] = {"foo":"overridden"};</script>' +
                '<script type="text/javascript">window["__INITIAL__PROPS__"] = {"custom":"initial"};</script>' +
                '</head><body><div id="app">' +
                '<span data-reactroot="" data-reactid="1" data-react-checksum="325457872">overridden|initial</span>' +
                '</div></body></html>'
            );

    });

});

test('createExpressMiddleware e2e 404', async() => {

    let NotFound = () => (<span>NotFound</span>);
    NotFound.notFound = true;

    const options = createOptions({
        createRoutes: (history) => (<Route path='*' component={NotFound}/>)
    });

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        expect(await (await fetch('http://localhost:3333/404')).text())
            .toBe(
                '<html><head>' +
                '<script type="text/javascript">window["__INITIAL__STATE__"] = {"foo":"initial"};</script>' +
                '<script type="text/javascript">window["__INITIAL__PROPS__"] = {};</script>' +
                '</head><body><div id="app">' +
                '<span data-reactroot="" data-reactid="1" data-react-checksum="790238053">NotFound</span>' +
                '</div></body></html>'
            );

    });

});

test('createExpressMiddleware e2e 500 error in template', async() => {

    const options = createOptions({
        template: () => (null)
    });

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        const text = await (await fetch('http://localhost:3333/')).text();

        expect(text).toContain('<h1>500 Server Error</h1>');
        expect(text).toContain('Return type of options.template() has to be a string');

    });

});

test('createExpressMiddleware e2e 500 with bad component', async() => {

    let BadComponent = () => { throw new Error('Bad Component'); };

    const options = createOptions({
        createRoutes: (history) => (<Route path='/bad' component={BadComponent}/>)
    });

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        expect(await (await fetch('http://localhost:3333/bad')).text())
            .toBe('[500]:Bad Component');

    });

});

test('createExpressMiddleware e2e with bad initialProps', async() => {

    let BadInitialProps = ({initialError}) => (<div>{initialError.message}</div>);
    BadInitialProps.getInitialProps = () => { throw new Error('Bad Initial Props'); };
    BadInitialProps = withWrapper(BadInitialProps);
    BadInitialProps = withRouter(BadInitialProps); // adding withRouter to make life harder

    const options = createOptions({
        createRoutes: (history) => (<Route path='/badInitial' component={BadInitialProps}/>)
    });

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        expect(await (await fetch('http://localhost:3333/badInitial')).text())
            .toBe(
                '<html><head>' +
                '<script type="text/javascript">window["__INITIAL__STATE__"] = {"foo":"initial"};</script>' +
                '<script type="text/javascript">window["__INITIAL__PROPS__"] = {"initialError":"Bad Initial Props"};</script>' +
                '</head><body><div id="app">' +
                '<div data-reactroot="" data-reactid="1" data-react-checksum="-1262873217">Bad Initial Props</div>' +
                '</div></body></html>'
            );

    });

});

test('createExpressMiddleware e2e w/o store', async() => {

    let NoStoreComponent = ({foo}) => (<div>{foo}</div>);
    NoStoreComponent.getInitialProps = () => ({foo: 'initial'});
    NoStoreComponent = withWrapper(NoStoreComponent);

    const options = createOptions({
        createStore: null,
        createRoutes: (history) => (<Route path='/noStore' component={NoStoreComponent}/>)
    });

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        expect(await (await fetch('http://localhost:3333/noStore')).text())
            .toBe(
                '<html><head>' +
                '<script type="text/javascript">window["__INITIAL__STATE__"] = undefined;</script>' +
                '<script type="text/javascript">window["__INITIAL__PROPS__"] = {"foo":"initial"};</script>' +
                '</head><body><div id="app">' +
                '<div data-reactroot="" data-reactid="1" data-react-checksum="-228912572">initial</div>' +
                '</div></body></html>'
            );

    });

});

test('createExpressMiddleware e2e hard 404', async() => {

    const options = createOptions({
        createRoutes: (history) => (<Route path='/' getComponent={() => { throw new Error('Should not be reached'); }}/>)
    });

    options.fs.writeFileSync('/foo', template, 'utf-8');

    return await serverTest(options, async(server) => {

        expect(await (await fetch('http://localhost:3333/404')).text())
            .toBe('[404]:Route Not Found');

    });

});
