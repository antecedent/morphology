Morphology = {
    leadingPunctuation: /^[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’“”¿¡«»-]*/,
    trailingPunctuation: /[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’“”¿¡«»-]*$/,
    preferredMorphemeLength: 3,
    numSalientSubstrings: 3000,
    minCommutationStrength: 30,
    minEdgeStrength: 1,
    edgeThresholdFactor: 5,
    pruningThreshold: 5000,
    openClassThresholdFactor: 100,
    successorThresholdFactor: 8,
    numWordsToInvent: 10000,
    commutationAnomalyFactor: 3,
    trainingSetProportion: 5,
    maxNumPrimaryCommutations: 3000,

    shuffle: (array) => {
        var result = Array.from(array);
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    },

    extractWords: (text) => {
        var words = new Set;
        for (var word of text.toLowerCase().split(/[\s\d]+/u)) {
            word = word.replace(Morphology.leadingPunctuation, '');
            word = word.replace(Morphology.trailingPunctuation, '');
            words.add(word);
        }
        return words;
    },

    addBoundaryChars: (words, progressCallback) => {
        var result = new Set;
        for (var word of words) {
            result.add('⋊' + word + '⋉');
        }
        return [result].concat(Morphology.makePrefixTree(result, progressCallback));
    },

    getSubstrings: (word) => {
        var result = new Set;
        result.add('')
        for (var i = 0; i < word.length + 1; i++) {
            for (var j = i + 1; j < word.length + 1; j++) {
                result.add(word.slice(i, j));
            }
        }
        return result;
    },

    getAllSubstrings: (words) => {
        var result = [];
        for (var word of words) {
            for (substring of Morphology.getSubstrings(word)) {
                result.push(substring);
            }
        }
        return result;
    },

    getFrequencyTable: (tokens) => {
        var table = {};
        for (var token of tokens) {
            if (!table.hasOwnProperty(token)) {
                table[token] = 0;
            }
            table[token]++;
        }
        return table;
    },

    getSalienceTable: (tokens) => {
        var result = [];
        var frequencies = Morphology.getFrequencyTable(tokens);
        for (var token of Object.keys(frequencies)) {
            result.push([frequencies[token] * Math.exp(-0.5 * Math.pow(token.length - Morphology.preferredMorphemeLength, 2)), token]);
        }
        result.sort((l, r) => r[0] - l[0]);
        return result;
    },

    getSalientSubstrings: (words) => {
        var substrings = Morphology.getAllSubstrings(words);
        var table = Morphology.getSalienceTable(substrings);
        var result = [];
        for (var [_, s] of table.slice(0, Morphology.numSalientSubstrings)) {
            result.push(s);
        }
        return result;
    },

    commute: (substrings, wordsWithBoundaries, prefixTree, wordArray, progressCallback) => {
        var templates = {};
        var commutations = {};
        var progress = 0;
        for (var m of substrings) {
            progressCallback(progress++, substrings.length);
            for (var word of Morphology.searchPrefixTree(prefixTree, m).map((i) => wordArray[i])) {
                if (word.includes(m)) {
                    var t = word.replace(m, '_');
                    if (!templates.hasOwnProperty(t)) {
                        templates[t] = new Set;
                    }
                    var alternants = [m];
                    var u = t.replace('_', '');
                    if (wordsWithBoundaries.has(u)) {
                        alternants.push('');
                    }
                    for (var a of alternants) {
                        for (var b of templates[t]) {
                            if (a == b) {
                                continue;
                            }
                            var [m1, m2] = [a, b];
                            if (m2 < m1) {
                                [m1, m2] = [m2, m1];
                            }
                            var key = m1 + ':' + m2;
                            if (!commutations.hasOwnProperty(key)) {
                                commutations[key] = new Set;
                            }
                            commutations[key].add(t);
                        }
                        templates[t].add(a);
                    }
                }
            }
        }
        var result = [];
        for (var key of Object.keys(commutations)) {
            [m1, m2] = key.split(':');
            result.push([commutations[key], m1, m2]);
        }
        result.sort((l, r) => r[0].size - l[0].size);
        return result.slice(0, Morphology.maxNumPrimaryCommutations);
    },

    refineCommutations: (commutations, prefixTree, wordArray, progressCallback) => {
        var deletions = new Set;
        for (var i = 0; i < commutations.length; i++) {
            progressCallback(i, commutations.length);
            var [s, m1, m2] = commutations[i];
            m1 = m1.replace('⋊', '').replace('⋉', '');
            m2 = m2.replace('⋊', '').replace('⋉', '');
            if (m2 < m1) {
                [m1, m2] = [m2, m1];
            }
            if (commutations.filter((p) => (p[1] == m1 && p[2] == m2) || (p[1] == m2 && p[2] == m1)).length == 0) {
                commutations.push([new Set, m1, m2]);
            }
            var c1 = commutations[i];
            for (var j = 0; j < commutations.length; j++) {
                if (i == j) {
                    continue;
                }
                var c2 = commutations[j];
                var [s1, x11, x12, s2, x21, x22] = c1.concat(c2);
                for (var [m11, m12, m21, m22] of [[x11, x12, x21, x22], [x12, x11, x21, x22]]) {
                    if (m21.replace(m11, '_') == m22.replace(m12, '_') || (m11 == '' && m21 == m22.replace(m12, ''))) {
                        for (var t of s2) {
                            commutations[i][0].add(t.replace('_', m22.replace(m12, '_')));
                        }
                        deletions.add(j);
                    }
                }
            }
        }
        for (var deletion of deletions) {
            commutations[deletion] = null;
        }
        commutations = commutations.filter((r) => r !== null);
        var result = [];
        for (var [set, m1, m2] of commutations) {
            var set = Morphology.removeAnomalies(set);
            if (set.size > Morphology.minCommutationStrength) {
                result.push([set, m1, m2]);
            }
        }
        return result;
    },

    removeAnomalies: (commutationProofs) => {
        commutationProofs = Array.from(commutationProofs);
        var distribution = {
            right: [],
            rightMarginal: [],
            left: [],
            leftMarginal: []
        };
        for (var proof of commutationProofs) {
            var pivot = proof.indexOf('_');
            if (pivot == 1) {
                distribution.leftMarginal.push(proof);
            } else if (pivot == proof.length - 2) {
                distribution.rightMarginal.push(proof);
            } else if (pivot < proof.length / 2) {
                distribution.left.push(proof);
            } else {
                distribution.right.push(proof);
            }
        }
        var max = Object.values(distribution).reduce((a, x) => Math.max(a, x.length), 0);
        var sum = Object.values(distribution).reduce((a, x) => a + x.length, 0);
        if (max > sum * (1 - 1 / Morphology.commutationAnomalyFactor)) {
            for (var type of Object.keys(distribution)) {
                if (distribution[type].length == max) {
                    return new Set(distribution[type]);
                }
            }
        }
        return new Set;
    },

    getBigrams: (commutations) => {
        var byWord = {};
        for (var [set, m1, m2] of commutations) {
            for (var t of set) {
                for (var m of [m1, m2]) {
                    var word = t.replace('_', m);
                    if (!byWord.hasOwnProperty(word)) {
                        byWord[word] = new Set;
                    }
                    if (m != '') {
                        byWord[word].add(t.indexOf('_'));
                        byWord[word].add(t.indexOf('_') + m.length);
                    }
                }
            }
        }
        var preResult = {};
        for (var word of Object.keys(byWord)) {
            byWord[word].add(0);
            byWord[word].add(1);
            byWord[word].add(word.length - 1);
            byWord[word].add(word.length);
            var offsets = Array.from(byWord[word]);
            offsets.sort((l, r) => l - r);
            var last = null;
            var w = word;
            for (var i = 1; i < offsets.length; i++) {
                var m = w.substring(offsets[i - 1], offsets[i]);
                if (last != null) {
                    key = last + ':' + m;
                    if (!preResult.hasOwnProperty(key)) {
                        preResult[key] = new Set;
                    }
                    preResult[key].add(word);
                }
                last = m;
            }
        }
        var result = [];
        for (var ab of Object.keys(preResult)) {
            var [a, b] = ab.split(':');
            result.push([preResult[ab].size, a, b]);
        }
        return result;
    },

    getMorphemes: (bigrams) => {
        var result = new Set;
        for (var [score, m1, m2] of bigrams) {
            result.add(m1);
            result.add(m2);
        }
        return result;
    },

    getAdjacencyMatrix: (bigrams, morphemes, commutations, text) => {
        var preResult = {};
        for (var [score, m1, m2] of bigrams) {
            var key = (m1 < m2) ? (m1 + ':' + m2) : (m2 + ':' + m1);
            if (!preResult.hasOwnProperty(key)) {
                preResult[key] = 0;
            }
            if (m1 < m2) {
                preResult[key] += score;
            } else {
                preResult[key] -= score;
            }
        }
        var relevantMorphemes = Array.from(morphemes);
        var frequencies = {};
        relevantMorphemes.sort((l, r) => l.length - r.length);
        relevantMorphemes = relevantMorphemes.slice(0, Morphology.pruningThreshold);
        var relevantMorphemes = new Set(relevantMorphemes);
        for (var [set, m1, m2] of commutations) {
            relevantMorphemes.add(m1);
            relevantMorphemes.add(m2);
        }
        relevantMorphemes.add('⋊');
        relevantMorphemes.add('⋉');
        relevantMorphemes.delete('');
        var morphemeMapping = {};
        var k = 0;
        for (var morpheme of relevantMorphemes) {
            if (!morphemeMapping.hasOwnProperty(morpheme)) {
                morphemeMapping[morpheme] = k++;
            }
        }
        var result = [];
        for (var i = 0; i < k; i++) {
            result.push([]);
            for (var j = 0; j < k; j++) {
                result[i].push(0);
            }
        }
        relevantMorphemes = new Set(relevantMorphemes);
        for (var key of Object.keys(preResult)) {
            var [m1, m2] = key.split(':');
            if (!relevantMorphemes.has(m1) || !relevantMorphemes.has(m2)) {
                continue;
            }
            if (preResult[key] > 0) {
                result[morphemeMapping[m1]][morphemeMapping[m2]] = 1;
            } else if (preResult[key] < 0) {
                result[morphemeMapping[m2]][morphemeMapping[m1]] = 1;
            }
        }
        return [result, morphemeMapping, relevantMorphemes];
    },

    concatenateMatrices: (mat1, mat2) => {
        var result = [];
        for (var i = 0; i < Math.min(mat1.length, mat2.length); i++) {
            result.push([]);
            for (var j = 0; j < mat1[i].length; j++) {
                result[i].push(mat1[i][j]);
            }
            for (var j = 0; j < mat2[i].length; j++) {
                result[i].push(mat2[i][j]);
            }
        }
        return result;
    },

    transposeMatrix: (mat) => {
        var result = [];
        for (var i = 0; i < mat[0].length; i++) {
            result.push([]);
            for (var j = 0; j < mat.length; j++) {
                result[i].push(mat[j][i]);
            }
        }
        return result;
    },

    doFirstPassClustering: (adjacencyMatrix, relevantMorphemes, commutations, morphemeMapping) => {

        var affixes = new Set;

        for (var [set, m1, m2] of commutations) {
            affixes.add(m1);
            affixes.add(m2);
        }

        affixes.add('⋊');
        affixes.add('⋉');

        var roots = new Set(relevantMorphemes);

        for (var affix of affixes) {
            roots.delete(affix);
        }

        var roots = Array.from(roots);
        var affixes = Array.from(affixes);

        var clusterByMorphemeId = {};
        var morphemeListByCluster = {};

        var numClusters = 0;

        for (var affix of affixes) {
            clusterByMorphemeId[morphemeMapping[affix]] = numClusters++;
            morphemeListByCluster[numClusters] = [affix];
        }

        var signatures = {};

        for (var root of roots) {
            var signature = [];
            var i = morphemeMapping[root];
            for (var affix of affixes) {
                var j = morphemeMapping[affix];
                signature.push(adjacencyMatrix[i][j]);
            }
            var key = signature.join('');
            if (!signatures.hasOwnProperty(key)) {
                signatures[key] = [];
            }
            signatures[key].push(root);
        }

        for (var signature of Object.keys(signatures)) {
            morphemeListByCluster[numClusters] = signatures[signature];
            for (var root of signatures[signature]) {
                clusterByMorphemeId[morphemeMapping[root]] = numClusters;
            }
            numClusters++;
        }

        var result = [];

        for (var i = 0; i < adjacencyMatrix.length; i++) {
            result.push(clusterByMorphemeId[i]);
        }

        Morphology.firstPassClusterCount = numClusters;

        return result;

        // var maxNumIterations = 20;
        // var features = Morphology.concatenateMatrices(adjacencyMatrix, Morphology.transposeMatrix(adjacencyMatrix));
        // var result = {converged: false};
        // var centroids = 'random';
        // var iteration = 0;
        // while (!result.converged && iteration < maxNumIterations) {
        //     result = ML.KMeans(features, Morphology.firstPassClusterCount, {initialization: centroids, maxIterations: 1});
        //     centroids = result.centroids.map((c) => c.centroid);
        //     progressCallback(iteration++, maxNumIterations);
        // }
        // return result.clusters;
    },

    doSecondPassClustering: (adjacencyMatrix, firstPassClusters, trainingWords, validationWords, morphemeMapping, progressCallback) => {
        var operations = [];

        var numFirstPassClusters = firstPassClusters.reduce((a, x) => Math.max(a, x), 0) + 1;

        for (var i = 0; i < numFirstPassClusters; i++) {
            // operations.push({
            //     type: 'delete',
            //     first: i
            // });
            for (var j = i + 1; j < numFirstPassClusters; j++) {
                operations.push({
                    type: 'merge',
                    first: i,
                    second: j,
                });
            }
        }

        var numOuterIterations = 10;
        var numInnerIterations = numFirstPassClusters;

        var highScore = 0;
        var bestClustering = Array.from(firstPassClusters);

        for (var i = 0; i < numOuterIterations; i++) {
            var history = [];
            var lastClustering = Array.from(firstPassClusters);
            var score = 0;
            var preResult = [];
            var shuffledOperations = Morphology.shuffle(operations);
            for (var j = 0; j < numInnerIterations; j++) {
                progressCallback((i * numInnerIterations) + j, numOuterIterations * numInnerIterations);
                var op = shuffledOperations[j];
                if (op.type == 'merge') {
                    var newClustering = Array.from(lastClustering);
                    for (var k = 0; k < newClustering.length; k++) {
                        if (newClustering[k] == op.second) {
                            newClustering[k] = op.first;
                        }
                    }
                    var [renumberedClusters, renumberedNumClusters] = Morphology.renumberClusters(newClustering, newClustering.reduce((a, x) => Math.max(a, x), 0) + 1, morphemeMapping);
                    var clusterInfo = Morphology.guessClusterTypes(renumberedNumClusters, renumberedClusters, adjacencyMatrix, morphemeMapping);
                    var inventions = Morphology.inventWords(renumberedNumClusters, clusterInfo, renumberedClusters[morphemeMapping['⋊']], renumberedClusters[morphemeMapping['⋉']], trainingWords, (p, t) => null);
                    var newScore = inventions.filter((w) => validationWords.has(w)).length / Morphology.numWordsToInvent;
                    if (newScore > score) {
                        score = newScore;
                        lastClustering = Array.from(newClustering);
                    }
                    if (newScore > highScore) {
                        highScore = newScore;
                        bestClustering = Array.from(newClustering);
                        console.log(newScore);
                    }
                }
            }
        }
        var [renumberedClusters, renumberedNumClusters] = Morphology.renumberClusters(bestClustering, bestClustering.reduce((a, x) => Math.max(a, x), 0) + 1, morphemeMapping);
        var clusterInfo = Morphology.guessClusterTypes(renumberedNumClusters, renumberedClusters, adjacencyMatrix, morphemeMapping);
        var inventions = Morphology.inventWords(renumberedNumClusters, clusterInfo, renumberedClusters[morphemeMapping['⋊']], renumberedClusters[morphemeMapping['⋉']], trainingWords, (p, t) => null);
        return [highScore, renumberedClusters, renumberedNumClusters, clusterInfo, inventions];
    },

    doSecondPassClusteringUsingKMeans: (adjacencyMatrix, firstPassClusters, progressCallback) => {
        var features = [];
        for (var i = 0; i < adjacencyMatrix.length; i++) {
            features.push([]);
            for (var j = 0; j < 2 * Morphology.firstPassClusterCount; j++) {
                features[i].push(0);
            }
        }
        for (var i = 0; i < adjacencyMatrix.length; i++) {
            for (var j = 0; j < adjacencyMatrix.length; j++) {
                features[i][firstPassClusters[j]] += adjacencyMatrix[i][j];
                features[j][Morphology.firstPassClusterCount + firstPassClusters[i]] += adjacencyMatrix[i][j];
            }
        }
        for (var i = 0; i < adjacencyMatrix.length; i++) {
            for (var j = 0; j < 2 * Morphology.firstPassClusterCount; j++) {
                if (features[i][j] > 0) {
                    features[i][j] = 1;
                }
            }
        }

        var maxNumIterations = 20;
        var result = {converged: false};
        var centroids = 'random';
        var iteration = 0;
        while (!result.converged && iteration < maxNumIterations) {
            result = ML.KMeans(features, Morphology.secondPassClusterCount, {initialization: centroids, maxIterations: 1});
            centroids = result.centroids.map((c) => c.centroid);
            progressCallback(iteration++, maxNumIterations);
        }
        return result.clusters;
    },

    generateLayout: (numMorphemes, clusters, numClusters, width, height, radius, progressCallback) => {
        var result = [];
        var numFailures = 0;
        var epsilon = radius;
        for (var i = 0; i < numMorphemes; i++) {
            progressCallback(i, numMorphemes);
            var candidate = {
                x: parseInt((width / 2) + (width / 2) * 0.8 * (Math.cos(2 * Math.PI / numClusters * clusters[i])) + epsilon * (2 * Math.random() - 1)),
                y: parseInt((height / 2) + (height / 2) * 0.8 * (Math.sin(2 * Math.PI / numClusters * clusters[i])) + epsilon * (2 * Math.random() - 1))
            };
            var [x1, y1] = [candidate.x, candidate.y];
            failed = false;
            for (var other of result) {
                if (candidate == other || other == null) {
                    continue;
                }
                [x2, y2] = [other.x, other.y];
                if (Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2)) < 1.25 * radius || x1 < radius || y1 < radius || x1 + radius > width || y1 + radius > height) {
                    failed = true;
                    break;
                }
            }
            if (failed && numFailures < 20) {
                i--;
                numFailures++;
                epsilon += radius * 0.25;
            } else {
                if (!failed) {
                    result.push(candidate);
                } else {
                    result.push(null);
                }
                numFailures = 0;
                epsilon = radius;
            }
        }
        return result;
    },

    renumberClusters: (clusters, numClusters, morphemeMapping) => {
        var translation = {};
        var result = [];
        var last = 0;
        for (var i = 0; i < numClusters; i++) {
            if (!translation.hasOwnProperty(i) && clusters.includes(i)) {
                translation[i] = last++;
            }
        }
        for (var cluster of clusters) {
            result.push(translation[cluster]);
        }
        for (var boundary of ['⋊', '⋉']) {
            var m = morphemeMapping[boundary];
            if (result.filter((c) => c == result[m]).length > 1) {
                result[m] = last++;
            }
        }
        return [result, last];
    },

    getRelevantEdges: (adjacencyMatrix, morphemeMapping, progressCallback) => {
        var edges = [];
        var count = Object.keys(morphemeMapping).length;
        for (var i = 0; i < count; i++) {
            progressCallback(i, count);
            for (var j = 0; j < count; j++) {
                if (adjacencyMatrix[i][j] > 0) {
                    edges.push([i, j]);
                }
            }
        }
        return edges;
    },

    guessClusterTypes: (numClusters, clusters, adjacencyMatrix, morphemeMapping) => {

        //
        // TODO
        //

        var reverseMorphemeMapping = [];
        for (var morpheme of Object.keys(morphemeMapping)) {
            reverseMorphemeMapping[morphemeMapping[morpheme]] = morpheme;
        }
        var counts = [];
        for (var i = 0; i < numClusters; i++) {
            counts.push(0);
            for (var cluster of clusters) {
                if (cluster == i) {
                    counts[i]++;
                }
            }
        }
        var sortedCounts = Array.from(counts);
        var prefixSums = [sortedCounts[0]];
        for (var i = 1; i < numClusters; i++) {
            prefixSums[i] = prefixSums[i - 1] + sortedCounts[i];
        }
        var pivot = 0;
        for (var i = 0; i < numClusters; i++) {
            if (prefixSums[i] > (1 / Morphology.openClassThresholdFactor) * prefixSums[numClusters - 1]) {
                pivot = sortedCounts[i];
                break;
            }
        }
        var result = [];
        for (var i = 0; i < numClusters; i++) {
            result.push({});
            result[i].open = counts[i] >= pivot;
            result[i].morphemes = [];
            for (var j = 0; j < reverseMorphemeMapping.length; j++) {
                if (clusters[j] == i) {
                    result[i].morphemes.push(reverseMorphemeMapping[j]);
                }
            }
            result[i].morphemes.sort();
            // result[i].prefix = false;
            // if (!result[i].open) {
            //     result[i]
            // }
            // result[i].marginal = false;
        }
        for (var i = 0; i < numClusters; i++) {
            result[i].successors = [];
            for (var j = 0; j < numClusters; j++) {
                if (i == j) {
                    continue;
                }
                var totalIn = 0;
                var totalOut = 0;
                var numIn = {};
                var numOut = {};
                for (var m1 of result[i].morphemes) {
                    for (var m2 of result[j].morphemes) {
                        if (adjacencyMatrix[morphemeMapping[m1]][morphemeMapping[m2]] > 0) {
                            /*if (!numOut.hasOwnProperty(m1)) {
                                numOut[m1] = 0;
                            }
                            if (!numIn.hasOwnProperty(m2)) {
                                numIn[m2] = 0;
                            }
                            numOut[m1]++;
                            numIn[m2]++;*/
                            result[i].successors.push(j);
                        }
                    }
                }
                /*for (var m of Object.keys(numIn)) {
                    if (numIn[m] > result[i].morphemes.length / Morphology.successorThresholdFactor) {
                        totalIn++;
                    }
                }
                for (var m of Object.keys(numOut)) {
                    if (numOut[m] > result[j].morphemes.length / Morphology.successorThresholdFactor) {
                        totalOut++;
                    }
                }
                if (totalIn > result[j].morphemes.length / Morphology.successorThresholdFactor &&
                    totalOut > result[i].morphemes.length / Morphology.successorThresholdFactor) {
                    result[i].successors.push(j);
                }*/
            }
        }
        return result;
    },

    inventWords: (numClusters, clusterInfo, initial, final, words, progressCallback) => {
        var i = 0;
        var result = new Set;
        var invent = (prefix, state, depth, depthLimit) => {
            i++;
            if (i % 1000 == 0) {
                result.add('<timeout:' + (i / 1000) + '>');
                progressCallback(result.size, Morphology.numWordsToInvent);
            }
            if (depth > depthLimit) {
                return;
            }
            if (result.size >= Morphology.numWordsToInvent) {
                return;
            }
            if (state == final && prefix.length > 0 && !words.has(prefix)) {
                result.add(prefix);
                progressCallback(result.size, Morphology.numWordsToInvent);
                return;
            }
            for (var newDepthLimit = depth + 1; newDepthLimit <= depthLimit; newDepthLimit++) {
                for (var successor of Morphology.shuffle(clusterInfo[state].successors)) {
                    for (var morpheme of Morphology.shuffle(clusterInfo[state].morphemes)) {
                        invent(prefix + morpheme, successor, depth + 1, newDepthLimit);
                    }
                }
            }
        };
        for (var depthLimit = 1; depthLimit <= 5; depthLimit++) {
            for (var next of Morphology.shuffle(clusterInfo[initial].successors)) {
                invent('', next, 0, depthLimit);
            }
        }
        result = Array.from(result);
        result.sort();
        return result;
    },

    segment: (text, words, clusters, clusterInfo, morphemeMapping, progressCallback) => {
        var run = (suffix, state) => {
            if (suffix == '') {
                return [];
            }
            for (var i = 1; i <= suffix.length; i++) {
                var substring = suffix.substring(0, i);
                if (morphemeMapping.hasOwnProperty(substring)) {
                    var next = clusters[morphemeMapping[substring]];
                    if (clusterInfo[state].successors.includes(next)) {
                        var subResult = run(suffix.substring(substring.length), next);
                        if (subResult !== null) {
                            return [substring].concat(subResult);
                        }
                    }
                }
            }
            return null;
        };
        var result = {};
        var k = 0;
        text = text.replace(/-/g, ' ');
        for (var word of words) {
            progressCallback(k++, words.size);
            result[word] = run(word.substring(1), clusters[morphemeMapping['⋊']]);
            if (result[word] !== null) {
                result[word] = result[word].slice(0, -1);
            }
            try {
                if (result[word] !== null && result[word].length > 1) {
                    text = text.replace(new RegExp('([^\\w\']|^)(' + word.substring(1, word.length - 1) + ')([^\\w\']|$)', 'ig'), '$1' + result[word].join('-') + '$3');
                }
            } catch (error) {
                // Ignore regex errors
            }
        }
        return [result, text];
    },

    makePrefixTree: (words, progressCallback) => {
        var wordArray = Array.from(words);
        var result = {items: []};
        for (var i = 0; i < wordArray.length; i++) {
            progressCallback(i, wordArray.length);
            for (var j = 0; j < wordArray[i].length; j++) {
                var suffix = wordArray[i].substring(j);
                var node = result;
                for (var k = 0; k < suffix.length; k++) {
                    var letter = suffix[k];
                    if (!node.hasOwnProperty(letter)) {
                        node[letter] = {items: []};
                    }
                    node[letter].items.push(i);
                    node = node[letter];
                }
            }
        }
        return [result, wordArray];
    },

    searchPrefixTree: (tree, substring) => {
        var node = tree;
        for (var i = 0; i < substring.length; i++) {
            var letter = substring[i];
            if (node.hasOwnProperty(letter)) {
                node = node[letter];
            } else {
                return [];
            }
        }
        return node.items;
    },

    boost: () => {

    }
};
