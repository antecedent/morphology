importScripts('morphology.js');

var dependencies = {};

var progress = (task, precision) => (done, total) => {
    if (!precision) {
        precision = 0;
    }
    postMessage({
        task: task,
        state: 'progress',
        progress: (100 * done / total).toFixed(precision)
    });
};

var paused = false;

var task = (name, callback) => {
    postMessage({
        task: name,
        state: 'initiated'
    });
    try {
        var result = callback();
        postMessage({
            task: name,
            state: 'completed',
            result: result
        });
        dependencies[name] = result;
        return result;
    } catch (error) {
        console.log(error);
        postMessage({
            task: name,
            state: 'failed',
            stack: error.stack
        });
        throw error;
    }
};

var sendImages = false;

var initialize = (e) => {
    for (var key of Object.keys(e.data.parameters)) {
        Morphology[key] = e.data.parameters[key];
    }
    preliminaryWords = e.data.text.split(/\s+/);
    Morphology.trainingSetProportion = Morphology.trainingSetProportion1 / Morphology.trainingSetProportion2;
    trainingSetPivot = Math.floor(preliminaryWords.length / (Morphology.trainingSetProportion + 1) * (Morphology.trainingSetProportion));
    trainingSet = preliminaryWords.slice(0, trainingSetPivot).join(' ');
    validationSet = preliminaryWords.slice(trainingSetPivot).join(' ');
    words = task('extractWords', () => Morphology.extractWords(trainingSet));
    validationWords = Morphology.extractWords(validationSet);
    for (var word of Array.from(validationWords)) {
        if (words.has(word)) {
            validationWords.delete(word);
        }
    }
    task('getValidationSet', () => validationWords);
    wordsWithBoundaries = task('addBoundaryChars', () => Morphology.addBoundaryChars(words));
    [prefixTree, wordArray] = task('makePrefixTree', () => Morphology.makePrefixTree(wordsWithBoundaries, progress('makePrefixTree')));
    [validationPrefixTree, _discard] = task('makeValidationPrefixTree', () => Morphology.makePrefixTree(Array.from(validationWords).map((w) => '⋊' + w + '⋉'), progress('makeValidationPrefixTree'), true));
    substrings = task('getSalientSubstrings', () => Morphology.getSalientSubstrings(wordsWithBoundaries));
    preliminaryWords = [];
    commutations = task('commute', () => Morphology.commute(substrings, wordsWithBoundaries, prefixTree, wordArray, progress('commute')));
    commutations = task('refineCommutations', () => Morphology.refineCommutations(commutations, prefixTree, wordArray, progress('refineCommutations')));
    bigrams = task('getBigrams', () => Morphology.getBigrams(commutations));
    morphemes = task('getMorphemes', () => Morphology.getMorphemes(bigrams));
    [adjacencyMatrix, morphemeMapping, relevantMorphemes, adjacencyList] =  Morphology.getAdjacencyMatrix(bigrams, morphemes, commutations, trainingSet.toLowerCase(), progress('getAdjacencyMatrix'));
    [firstPassClusters, signatures] = task('doFirstPassClustering', () => Morphology.doFirstPassClustering(
        adjacencyMatrix,
        relevantMorphemes,
        commutations,
        morphemeMapping
    ));
    info = Morphology.getClusterInfo(null, firstPassClusters, adjacencyList, morphemeMapping, commutations);
    [info, firstPassClusters, adjacencyList, morphemeMapping] = Morphology.splitMorphemes(info);
    numFirstPassClusters = new Set(firstPassClusters).size;
    Morphology.MDLUpperBound = Math.min(numFirstPassClusters, Morphology.maxNumClusters);
    task('getAdjacencyMatrix', () => [null, morphemeMapping]);
    //console.log(JSON.stringify(firstPassClusters));
    dependencies.adjacencyList = adjacencyList;
    dependencies.morphemeMapping = morphemeMapping;
    dependencies.validationPrefixTree = validationPrefixTree;
    dependencies.numValidationWords = validationWords.size;
    dependencies.trainingWords = words;

    initialClustering = {score: 0, clusters: firstPassClusters, info: info, history: []};

    reclusterings = [initialClustering];

    task('restoreStateFromCache', () => {
        var i = 0;
        if (e.data.parameters.clusterings) {
            try {
                for (var clustering of e.data.parameters.clusterings) {
                    progress('restoreStateFromCache')(i++, e.data.parameters.clusterings.length);
                    try {
                        reclusterings.push(Morphology.reenactReclusteringHistory(clustering.history, firstPassClusters, info, dependencies));
                    } catch (error) {
                        reclusterings = [initialClustering];
                        debugger;
                    }
                }
            } catch (error) {
                debugger;
            }
        }
    });

    if (reclusterings.length > 1) {
        console.log(`${reclusterings.length - 1} clustering(s) have been loaded from local cache.`);
    }

    highScore = 0;
    numReclusteringsToKeep = 100;
    numBuckets = 10;


    firstReclustering = true;

    task('initialized', () => null);
};

onmessage = (e) => {
    if (e.data.action) {
        if (e.data.action == 'run') {
            run();
        }
        if (e.data.action == 'initialize') {
            initialize(e);
        }
    }
};

var run = () => {
    if (reclusterings.length > numReclusteringsToKeep) {
        var reclusteringsBackup = Morphology.shuffle(reclusterings)[0];
        reclusterings = [initialClustering];
        var max = reclusteringsBackup.reduce((a, x) => Math.max(x.score, a), 0);
        var min = reclusteringsBackup.reduce((a, x) => Math.min(x.score, a), Infinity);
        var bucketSize = (max - min) / numBuckets;
        for (var bucket = min; bucket < max; bucket += bucketSize) {
            var i = 0;
            for (var r of reclusteringsBackup) {
                if (r.score >= bucket && r.score <= bucket + bucketSize) {
                    reclusterings.push(r);
                    if (i++ > numReclusteringsToKeep / numBuckets) {
                        break;
                    }
                }
            }
        }

    }
    reclusterings.sort((l, r) => r.score - l.score);
    //console.log(JSON.stringify(reclusterings.map((x) => x.score)));
    span = reclusterings.length;
    if (Math.random() < 0.5) {
        span = Math.sqrt(span);
    }
    pick = Math.floor(span * Math.random());
    clusters = Array.from(reclusterings[pick].clusters);
    info = Morphology.copyClusterInfo(reclusterings[pick].info);
    reclustering = task('doSecondPassClustering', () => Morphology.recluster(info, Array.from(clusters), reclusterings[pick].history, dependencies, firstReclustering ? progress('doSecondPassClustering') : null));
    //info = Morphology.copyClusterInfo(reclustering.info);
    reclusterings.push(reclustering);
    if (reclustering.score - highScore < Morphology.minGain) {
        task('ready', () => null);
        return;
    }
    highScore = reclustering.score;
    task('beginPayload', () => true);
    task('score', () => reclustering.score);
    task('inventWords', () => reclustering.inventedWords);
    translation = {};
    [clustersToSend, numClustersToSend] = task('renumberClusters', () => Morphology.renumberClusters(reclustering.clusters, null, morphemeMapping, translation));
    task('doSecondPassClustering', () => clustersToSend);
    morphemesAsObject = {};
    for (var source of Object.keys(translation)) {
        morphemesAsObject[translation[source]] = {morphemes: reclustering.info[source].morphemes};
    }
    renumberedInfo = Array.from(Object.values(morphemesAsObject));
    task('getClusterInfo', () => renumberedInfo.map((i) => ({morphemes: i.morphemes})));
    //var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, clustersToSend, null, renumberedInfo, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, (p, t) => null));
    //var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyList, morphemeMapping, clustersToSend, renumberedInfo, (p, t) => null));
    task('getClusterings', () => reclusterings.map((r) => ({history: r.history})));
    task('network', () => Morphology.network(reclustering.info));
    firstReclustering = false;
    task('ready', () => null);
};
