importScripts('morphology.js');
importScripts('https://www.lactame.com/lib/ml/3.2.0/ml.min.js');

var progress = (task) => (done, total) => {
    postMessage({
        task: task,
        state: 'progress',
        progress: parseInt(100 * done / total)
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
        var trainingSetPivot = parseInt(preliminaryWords.length / (Morphology.trainingSetProportion + 1) * Morphology.trainingSetProportion);
        var trainingSet = preliminaryWords.slice(0, trainingSetPivot).join(' ');
        var validationSet = preliminaryWords.slice(trainingSetPivot).join(' ');
        var words = task('extractWords', () => Morphology.extractWords(trainingSet));
        var validationWords = Morphology.extractWords(validationSet);
        for (var word of validationWords) {
            if (words.has(word)) {
                validationWords.delete(word);
            }
        }
        task('getValidationSet', () => validationWords);
        var wordsWithBoundaries = task('addBoundaryChars', () => Morphology.addBoundaryChars(words));
        var substrings = task('getSalientSubstrings', () => Morphology.getSalientSubstrings(wordsWithBoundaries));
        var commutations = task('commute', () => Morphology.commute(substrings, wordsWithBoundaries, progress('commute')));
        commutations = task('refineCommutations', () => Morphology.refineCommutations(commutations, words, progress('refineCommutations')));
        var bigrams = task('getBigrams', () => Morphology.getBigrams(commutations));
        var morphemes = task('getMorphemes', () => Morphology.getMorphemes(bigrams));
        var [adjacencyMatrix, morphemeMapping] = task('getAdjacencyMatrix', () => Morphology.getAdjacencyMatrix(bigrams, morphemes, trainingSet.toLowerCase()));
        var score = 0;
        var secondPassClusters, numClusters, morphemeTypes, inventedWords;
        for (var i = 1; i <= e.data.parameters.numClusteringIterations; i++) {
            var _firstPassClusters = task('doFirstPassClustering.' + i, () => Morphology.doFirstPassClustering(adjacencyMatrix));
            var _secondPassClusters = task('doSecondPassClustering.' + i, () => Morphology.doSecondPassClustering(adjacencyMatrix, _firstPassClusters));
            var _numClusters;
            [_secondPassClusters, _numClusters] = task('renumberClusters.' + i, () => Morphology.renumberClusters(_secondPassClusters, Morphology.secondPassClusterCount, morphemeMapping));
            var _morphemeTypes = task('guessClusterTypes.' + i, () => Morphology.guessClusterTypes(_numClusters, _secondPassClusters, adjacencyMatrix, morphemeMapping));
            var _inventedWords = task('inventWords.' + i, () => Morphology.inventWords(_numClusters, _morphemeTypes, _secondPassClusters[morphemeMapping['⋊']], _secondPassClusters[morphemeMapping['⋉']], words, progress('inventWords.' + i)));
            var _score = _inventedWords.filter((w) => validationWords.has(w)).length / Morphology.numWordsToInvent;
            task('score.' + i, () => _score);
            if (_score >= score) {
                secondPassClusters = _secondPassClusters;
                numClusters = _numClusters;
                morphemeTypes = _morphemeTypes;
                inventedWords = _inventedWords;
                score = _score;
            }
        }
        task('renumberClusters', () => [secondPassClusters, numClusters]);
        task('guessClusterTypes', () => morphemeTypes);
        task('inventWords', () => inventedWords);
        var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, secondPassClusters, numClusters, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, progress('generateLayout')));
        var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyMatrix, morphemeMapping, progress('getRelevantEdges')));
        //task('segment', () => Morphology.segment(e.data.text, wordsWithBoundaries, secondPassClusters, morphemeTypes, morphemeMapping, progress('segment')));
        task('done', () => null)
    } catch (error) {
        // Already handled by task()
    }
};
