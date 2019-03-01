require('dotenv').config();

const gulp = require('gulp');
const rename = require('gulp-rename');
const clean = require('gulp-clean');
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

gulp.task('namespace', function () {

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

});

gulp.task('clean', function (done) {
    return gulp.src(['update_set/**/*.*'], { read: false })
        .pipe(using({}))
        .pipe(clean());
});

gulp.task('update-set', function () {
    return gulp.src('original/sys_remote_update_set_*.xml')
        .pipe(replace(new RegExp(process.env.REPLACE_COMPANY, 'ig'), 'company'))
        .pipe(replace(`<namespace>${process.env.REPLACE_NAMESPACE || 'devops'}</namespace>`, '<namespace>devops</namespace>'))
        .pipe(replace(`<value>${process.env.REPLACE_SECRET}</value>`, '<value>5VCSj9SPRH3EbNHrBSTf</value>'))
        .pipe(replace(`/${process.env.REPLACE_NAMESPACE}/`, '/devops/'))
        .pipe(replace(/<(u_[^\/>]*)\/>/g, ''))
        .pipe(replace(/<(u_[^\s\/>]*)[^>]*>.*<\/(\1)>/g, ''))
        
        .pipe(replace(new RegExp(process.env.USERNAME, 'ig'), 'b.moers'))
        .pipe(rename({
            basename: "CICD Integration"
        }))
        .pipe(gulp.dest('update_set/.'));
});

gulp.task('script', function () {
    var paths = ['script_include/**/*.js', 'processor/**/*.js'];
    return gulp.src(paths, { base: "./" })
        .pipe(using({}))
        .pipe(replace(new RegExp(process.env.USERNAME, 'ig'), 'b.moers'))
        .pipe(replace(`/${process.env.REPLACE_NAMESPACE}/`, '/devops/'))
        .pipe(gulp.dest('./'));
});

gulp.task('default', function () {
    return gulp.start(['clean', 'update-set', 'script']);
})