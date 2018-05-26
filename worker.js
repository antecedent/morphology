importScripts('morphology.js');
importScripts('https://www.lactame.com/lib/ml/3.2.0/ml.min.js');

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
        postMessage({
            task: name,
            state: 'failed',
            stack: error.stack
        });
        throw error;
    }
};

onmessage = (e) => {
    for (var key of Object.keys(e.data.parameters)) {
        Morphology[key] = e.data.parameters[key];
    }
    try {
        var preliminaryWords = e.data.text.split(/\s+/);
        var trainingSetPivot = Math.floor(preliminaryWords.length / (Morphology.trainingSetProportion + 1) * (Morphology.trainingSetProportion));
        trainingSetPivot = Math.min(trainingSetPivot, 30000);
        var trainingSet = preliminaryWords.slice(0, trainingSetPivot).join(' ');
        var validationSet = preliminaryWords.slice(trainingSetPivot).join(' ');
        var words = task('extractWords', () => Morphology.extractWords(trainingSet));
        var validationWords = Morphology.extractWords(validationSet);
        for (var word of Array.from(validationWords)) {
            if (words.has(word)) {
                validationWords.delete(word);
            }
        }
        task('getValidationSet', () => validationWords);
        var wordsWithBoundaries = task('addBoundaryChars', () => Morphology.addBoundaryChars(words));
        var [prefixTree, wordArray] = task('makePrefixTree', () => Morphology.makePrefixTree(wordsWithBoundaries, progress('makePrefixTree')));
        var [validationPrefixTree, _] = task('makeValidationPrefixTree', () => Morphology.makePrefixTree(Array.from(validationWords).map((w) => '⋊' + w + '⋉'), progress('makeValidationPrefixTree'), true));
        var substrings = task('getSalientSubstrings', () => Morphology.getSalientSubstrings(wordsWithBoundaries));
        preliminaryWords = [];
        var commutations = task('commute', () => Morphology.commute(substrings, wordsWithBoundaries, prefixTree, wordArray, progress('commute')));
        commutations = task('refineCommutations', () => Morphology.refineCommutations(commutations, prefixTree, wordArray, progress('refineCommutations')));
        var bigrams = task('getBigrams', () => Morphology.getBigrams(commutations));
        var morphemes = task('getMorphemes', () => Morphology.getMorphemes(bigrams));
        var [adjacencyMatrix, morphemeMapping, relevantMorphemes] = task('getAdjacencyMatrix', () => Morphology.getAdjacencyMatrix(bigrams, morphemes, commutations, trainingSet.toLowerCase(), progress('getAdjacencyMatrix')));
        var [firstPassClusters, signatures] = task('doFirstPassClustering', () => Morphology.doFirstPassClustering(
            adjacencyMatrix,
            relevantMorphemes,
            commutations,
            morphemeMapping
        ));
        dependencies.adjacencyMatrix = adjacencyMatrix;
        dependencies.commutations = commutations;
        dependencies.morphemeMapping = morphemeMapping;
        dependencies.validationPrefixTree = validationPrefixTree;
        dependencies.numValidationWords = validationWords.size;
        dependencies.trainingWords = words;

        var reclusterings = e.data.parameters.clusterings || [];

        if (reclusterings.length > 0) {
            console.log(`${reclusterings.length} clustering(s) have been loaded from local cache.`);
        }

        var highScore = 0;
        var numReclusteringsToKeep = 100;

        dependencies.originalInfo =
            Morphology.getClusterInfo(
                null,
                firstPassClusters,
                dependencies.adjacencyMatrix,
                dependencies.morphemeMapping,
                dependencies.commutations
            );

        var firstReclustering = true;

        while (true) {
            if (Math.random() < 0.1 || reclusterings.length == 0) {
                var clusters = firstPassClusters;
            } else {
                var clusters = reclusterings[Math.floor(reclusterings.length * Math.random())].clusters;
            }
            var reclustering = task('doSecondPassClustering', () => Morphology.recluster(clusters, dependencies, firstReclustering ? progress('doSecondPassClustering') : null));
            reclusterings.push(reclustering);
            reclusterings.sort((l, r) => r.score - l.score);
            if (reclusterings.length > numReclusteringsToKeep) {
                reclusterings.pop();
            }
            console.log((100 * reclustering.score).toFixed(2) + '%');
            if (reclustering.score - highScore < Morphology.minGain) {
                continue;
            }
            highScore = reclustering.score;
            task('doSecondPassClustering', () => reclustering.clusters);
            task('score', () => reclustering.score);
            task('inventWords', () => reclustering.inventedWords);
            var info =
                Morphology.getClusterInfo(
                    null,
                    reclustering.clusters,
                    dependencies.adjacencyMatrix,
                    dependencies.morphemeMapping,
                    dependencies.commutations
                );
            task('renumberClusters', () => [reclustering.clusters, null]);
            var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, reclustering.clusters, null, info, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, progress('generateLayout')));
            var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyMatrix, morphemeMapping, reclustering.clusters, info, progress('getRelevantEdges')));
            task('getClusterInfo', () => info);
            task('ready', () => null);
            task('getClusterings', () => reclusterings);
            firstReclustering = false;
        }
    } catch (error) {
        throw error;
        // Already handled by task()
    }
};
