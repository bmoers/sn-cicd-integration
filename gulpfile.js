require('dotenv').config();

const gulp = require('gulp');
const rename = require('gulp-rename');
const gulpClean = require('gulp-clean');
const notify = require('gulp-notify');
const using = require('gulp-using');
const replace = require('gulp-replace');

const arg = (argList => {
    let arg = {}, a, opt, thisOpt, curOpt;
    argList.forEach((thisOpt) => {
        thisOpt = (thisOpt) ? thisOpt.trim() : thisOpt;
        opt = thisOpt.replace(/^\-+/, '');
        if (opt === thisOpt) {
            if (curOpt)
                arg[curOpt] = opt;
            curOpt = null;
        } else {
            curOpt = opt;
            arg[curOpt] = true;
        }
    });
    return arg;

})(process.argv);

const namespace = function () {

    /*
        if you want to install this US in your own company namespace,
        set it below and run 'gulp namespace --name your-name-space'
    */

    const customNameSpace = arg.name;
    if (!customNameSpace)
        throw Error('run: gulp namespace --name your-name-space')

    console.log(`Replacing namespace with '${customNameSpace}'`);

    var paths = [
        "update_set/**/*.xml"
    ];
    return gulp.src(paths, { base: "./" })
        .pipe(replace('<namespace>devops</namespace>', `<namespace>${customNameSpace}</namespace>`))
        .pipe(replace('/devops/', `/${customNameSpace}/`))
        .pipe(rename({
            basename: `CICD Integration-${customNameSpace}`
        }))
        .pipe(gulp.dest('./'));

};

const clean = function () {
    return gulp.src(['update_set/**/*.*'], { read: false })
        .pipe(using({}))
        .pipe(gulpClean());
};

const updateSet = function () {

    if (!process.env.REPLACE_USER)
        throw Error('process.env.REPLACE_USER not defined');

    if (!process.env.REPLACE_COMPANY)
        throw Error('process.env.REPLACE_COMPANY not defined');

    if (!process.env.REPLACE_NAMESPACE)
        throw Error('process.env.REPLACE_NAMESPACE not defined');

    if (!process.env.REPLACE_SECRET)
        throw Error('process.env.REPLACE_SECRET not defined');

    return gulp.src('original/sys_remote_update_set_*.xml')
        .pipe(replace(new RegExp(process.env.REPLACE_COMPANY, 'ig'), 'company'))
        .pipe(replace(`<namespace>${process.env.REPLACE_NAMESPACE || 'devops'}</namespace>`, '<namespace>devops</namespace>'))
        .pipe(replace(`<value>${process.env.REPLACE_SECRET}</value>`, '<value>5VCSj9SPRH3EbNHrBSTf</value>'))
        .pipe(replace(`/${process.env.REPLACE_NAMESPACE}/`, '/devops/'))
        .pipe(replace(/(<name>cicd-integration\.enabled<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.enabled\.on-scoped-app<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.scoped-app\.single-update-set<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.enabled\.on-update-set<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.message\.build-state<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.server\.url<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>https://localhost:8443</value>'))
        .pipe(replace(/(<name>cicd-integration\.server\.through-mid<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>true</value>'))        
        .pipe(replace(/(<name>cicd-integration\.server\.mid-server-name<\/name>.*)<value>([^<]+)<\/value>/, '$1<value></value>'))
        .pipe(replace(/(<name>cicd-integration\.jsdocButton\.enabled<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>true</value>'))
        .pipe(replace(/(<name>cicd-integration\.show\.repository-field<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.prevent\.add-sys-app-to-update-set<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.prevent\.no-multi-scope-update-set<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
        .pipe(replace(/(<name>cicd-integration\.ignore-delivery-conflicts<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))
    
        .pipe(replace(/(<name>cicd-integration\.pull-request-proxy\.enabled<\/name>.*)<value>([^<]+)<\/value>/, '$1<value>false</value>'))

        .pipe(replace(/<(u_[^\/>]*)\/>/g, ''))
        .pipe(replace(/<u_repository>cicd_integration<\/u_repository>/, '<u_repository/>'))
        .pipe(replace(/<(u_(?!.*repository).*)[^>]*>.*<\/(\1)>/g, ''))
        //.pipe(replace(/<(u_[^\s\/>]*)[^>]*>.*<\/(\1)>/g, ''))

        .pipe(replace(new RegExp(process.env.REPLACE_USER, 'ig'), 'b.moers'))
        .pipe(rename({
            basename: "CICD Integration"
        }))
        .pipe(gulp.dest('update_set/.'));
};

const script = function () {

    if (!process.env.REPLACE_USER)
        throw Error('process.env.REPLACE_USER not defined');

    if (!process.env.REPLACE_NAMESPACE)
        throw Error('process.env.REPLACE_NAMESPACE not defined');

    var paths = ['script_include/**/*.js', 'processor/**/*.js'];
    return gulp.src(paths, { base: "./" })
        .pipe(using({}))
        .pipe(replace(new RegExp(process.env.REPLACE_USER, 'ig'), 'b.moers'))
        .pipe(replace(`/${process.env.REPLACE_NAMESPACE}/`, '/devops/'))
        .pipe(gulp.dest('./'));
};


const build = gulp.series(clean, gulp.parallel(updateSet, script));


exports.namespace = namespace;

exports.clean = clean;

exports.build = build;

exports.default = build;
