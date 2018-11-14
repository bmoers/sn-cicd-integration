
const gulp = require('gulp');
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
        set it below and run 'gulp namespace'
    */
    
    const customNameSpace = arg.name;
    if (!customNameSpace)
        throw Error('run: gulp namespace --name your-name-space')

    console.log(`Replacing namespace with '${customNameSpace}'`);
    return;
    
    var paths = [
        "update_set/**/*.xml"
    ];
    gulp.src(paths, { base: "./" })
        .pipe(replace('<namespace>swre</namespace>', `<namespace>${customNameSpace}</namespace>`))
        .pipe(replace('/swre/', `/${customNameSpace}/`))
        .pipe(gulp.dest('./'));

});


gulp.task('default', function () {
    var paths = [
        "update_set/**/*.xml",
        "script_include/**/*.js"
    ];
    gulp.src(paths, { base: "./" })
        .pipe(replace(new RegExp(process.env.USERNAME, 'ig'), 'b.moers'))
        .pipe(gulp.dest('./'));
});