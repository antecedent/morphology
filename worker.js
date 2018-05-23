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
        var trainingSetPivot = Math.floor(preliminaryWords.length / (Morphology.trainingSetProportion + 1));
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
        var [wordsWithBoundaries, prefixTree, wordArray] = task('addBoundaryChars', () => Morphology.addBoundaryChars(words, progress('addBoundaryChars')));
        var substrings = task('getSalientSubstrings', () => Morphology.getSalientSubstrings(wordsWithBoundaries));
        preliminaryWords = [];

        var commutations = task('commute', () => Morphology.commute(substrings, wordsWithBoundaries, prefixTree, wordArray, progress('commute')));
        commutations = task('refineCommutations', () => Morphology.refineCommutations(commutations, prefixTree, wordArray, progress('refineCommutations')));
        var bigrams = task('getBigrams', () => Morphology.getBigrams(commutations));
        var morphemes = task('getMorphemes', () => Morphology.getMorphemes(bigrams));
        var [adjacencyMatrix, morphemeMapping, relevantMorphemes] = task('getAdjacencyMatrix', () => Morphology.getAdjacencyMatrix(bigrams, morphemes, commutations, trainingSet.toLowerCase(), progress('getAdjacencyMatrix')));
        var [_firstPassClusters, signatures] = task('doFirstPassClustering', () => Morphology.doFirstPassClustering(
            adjacencyMatrix,
            relevantMorphemes,
            commutations,
            morphemeMapping
        ));
        var [score, secondPassClusters, numClusters, clusterInfo, inventedWords] = task('doSecondPassClustering.1', () => Morphology.doSecondPassClustering(
            adjacencyMatrix,
            _firstPassClusters,
            words,
            validationWords,
            morphemeMapping,
            commutations,
            signatures,
            progress('doSecondPassClustering.1')
        ));

        //var secondPassClusters, numClusters, clusterInfo, inventedWords;
        var numFirstPassClusters = (new Set(_firstPassClusters)).size;



        /*
        var score = 0;
        var z = 1;
        var _window = [];
        var left = 1;
        var right = numFirstPassClusters;
        for (var i = 1; Math.abs(right - left) > 2; i++) {
            console.log(left, right);
            var [leftThird, rightThird] = [parseInt(left + (right - left) / 3), parseInt(right - (right - left) / 3)];
            var [fLeftThird, fRightThird] = [leftThird, rightThird].map((k) => {
                var scores = [];
                for (var j = 1; j <= 10; j++) {
                    Morphology.secondPassClusterCount = parseInt((left + right) / 2);
                    var _secondPassClusters = task('doSecondPassClustering.' + i, () => Morphology.doSecondPassClustering(adjacencyMatrix, _firstPassClusters, progress('doSecondPassClustering.' + i)));
                    var _numClusters;
                    [_secondPassClusters, _numClusters] = task('renumberClusters.' + i, () => Morphology.renumberClusters(_secondPassClusters, Morphology.secondPassClusterCount, morphemeMapping));
                    var _clusterInfo = task('guessClusterTypes.' + i, () => Morphology.guessClusterTypes(_numClusters, _secondPassClusters, adjacencyMatrix, morphemeMapping));
                    var _inventedWords = task('inventWords.' + i, () => Morphology.inventWords(_numClusters, _clusterInfo, _secondPassClusters[morphemeMapping['⋊']], _secondPassClusters[morphemeMapping['⋉']], words, progress('inventWords.' + i)));
                    var _score = _inventedWords.filter((w) => validationWords.has(w)).length / Morphology.numWordsToInvent;
                    task('score.' + i, () => score);
                    if (_score / k >= score / z) {
                        secondPassClusters = _secondPassClusters;
                        numClusters = _numClusters;
                        clusterInfo = _clusterInfo;
                        inventedWords = _inventedWords;
                        score = _score;
                        z = k;
                    }
                    scores.push(_score / k);
                }
                return scores.reduce((a, x) => Math.max(a, x), 0);
            });
            if (fLeftThird < fRightThird) {
                left = leftThird;
            } else {
                right = rightThird;
            }
        }
        */
        task('score', () => score);
        task('renumberClusters', () => [secondPassClusters, numClusters]);
        task('guessClusterTypes', () => clusterInfo);
        inventedWords.sort();
        task('inventWords', () => inventedWords);
        var layout = task('generateLayout', () => Morphology.generateLayout(Object.keys(morphemeMapping).length, secondPassClusters, numClusters, clusterInfo, e.data.canvasWidth, e.data.canvasHeight, e.data.vertexRadius, progress('generateLayout')));
        var edges = task('getRelevantEdges', () => Morphology.getRelevantEdges(adjacencyMatrix, morphemeMapping, secondPassClusters, clusterInfo, progress('getRelevantEdges')));
        task('ready', () => null)
        task('segment', () => Morphology.segment(e.data.text, wordsWithBoundaries, secondPassClusters, clusterInfo, morphemeMapping, progress('segment')));
        task('done', () => null)
    } catch (error) {
        // Already handled by task()
    }
};
