Morphology = {
    leadingPunctuation: /^[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’„“”¿¡«»-]*/,
    trailingPunctuation: /[!"#$%&\'()*+,-./:;<=>?@\[\\\]\^_`{|}~—‘’„“”¿¡«»-]*$/,
    preferredMorphemeLength: 3,
    numSalientSubstrings: 3000,
    minCommutationStrength: 30,
    minEdgeStrength: 1,
    edgeThresholdFactor: 5,
    pruningThreshold: 5000,
    openClassThresholdFactor: 100,
    successorThresholdFactor: 8,
    commutationAnomalyFactor: 3,
    maxNumPrimaryCommutations: 3000,
    clusteringIntensity: 100,
    numSecondPassClusteringOuterIterations: 1,
    minGain: 0.001,
    commutations: [],
    checkSubsets: false,
    phonotacticPenalty: 50,
    numClusteringOperations: 10000,
    precisionMultiplier: 1,
    recallMultiplier: 1,

    product: function* (iterable, n) {
        if (n > 0) {
            for (var item of iterable) {
                for (var rest of Morphology.product(iterable, n - 1)) {
                    yield [item].concat(rest);
                }
            }
        } else {
            yield [];
        }
    },

    learnPhonotactics: (words, n) => {
        // words with boundaries
        // use n-grams
        var getNGrams = (n) => {
            var result = {};
            var unigrams = {};
            for (var word of words) {
                for (var i = 0; i < word.length; i++) {
                    if (!unigrams.hasOwnProperty(word[i])) {
                        unigrams[word[i]] = 0;
                    }
                    unigrams[word[i]]++;
                    if (i + n > word.length) {
                        continue;
                    }
                    var nGram = word.substring(i, i + n);
                    if (!result.hasOwnProperty(nGram)) {
                        result[nGram] = 0;
                    }
                    result[nGram]++;
                }
            }
            var absences = new Set;
            var unigramFrequencies = Object.values(unigrams);
            unigramFrequencies.sort((l, r) => r - l);
            var cutoff = 0;
            if (unigramFrequencies.length > 100) {
                cutoff = unigramFrequencies[100];
            }
            // Filter out quotations in foreign alphabets
            var unigrams = Object.keys(unigrams).filter((u) => unigrams[u] > cutoff);
            console.log(`# of relevant unigrams: ${unigrams.length}`);
            for (var nGram of Morphology.product(unigrams, n)) {
                nGram = nGram.join('');
                var test = nGram;
                if (test[0] == '⋊') {
                    test = test.substring(1);
                }
                if (test[test.length - 1] == '⋉') {
                    test = test.substring(0, test.length - 1);
                }
                if (test.match(/[⋊⋉]/) !== null) {
                    continue;
                }
                if (!result.hasOwnProperty(nGram)) {
                    result[nGram] = 0;
                    absences.add(nGram);
                }
            }
            return [result, Array.from(absences)];
        };
        var result = [];
        for (var n of [2, 3]) {
            var [nGrams, absences] = getNGrams(n);
            result.push({
                n: n,
                nGrams: nGrams,
                absences: absences
            });
        }
        return result;
    },

    shuffle: (items) => {
        var result = Array.from(items);
        for (var i = 0; i < result.length; i++) {
            result[i] = i;
        }
        for (var i = result.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        var shuffling = Array.from(result);
        var itemsAsArray = Array.from(items);
        var result = [];
        for (var i = 0; i < itemsAsArray.length; i++) {
            result.push(itemsAsArray[shuffling[i]]);
        }
        return [result, shuffling];
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
        return result;
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
        if (Morphology.commutations.length > 0) {
            return Morphology.commutations.map((c) => [new Set(c[0]), c[1], c[2]]);
        }
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
        if (Morphology.commutations.length > 0) {
            return Morphology.commutations.map((c) => [new Set(c[0]), c[1], c[2]]);
        }
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
        var prefixes = new Set;
        var suffixes = new Set;
        var marginals = new Set;
        prefixes.add('⋊');
        suffixes.add('⋉');
        for (var [set, m1, m2] of commutations) {
            for (var t of set) {
                for (var m of [m1, m2]) {
                    if (['left', 'leftMarginal'].includes(Morphology.getAffixSite(t))) {
                        prefixes.add(m);
                    }
                    if (['right', 'rightMarginal'].includes(Morphology.getAffixSite(t))) {
                        suffixes.add(m);
                    }
                    if (['leftMarginal', 'rightMarginal'].includes(Morphology.getAffixSite(t))) {
                        marginals.add(m);
                    }
                    var word = t.replace('_', m);
                    if (!byWord.hasOwnProperty(word)) {
                        byWord[word] = new Set;
                    }
                    byWord[word].add(t.indexOf('_'));
                    byWord[word].add(t.indexOf('_') + m.length);
                }
            }
        }
        var preResult = {};
        for (var word of Object.keys(byWord)) {
            byWord[word].delete(0);
            byWord[word].delete(1);
            byWord[word].delete(word.length - 1);
            byWord[word].delete(word.length);
            var allOffsets = Array.from(byWord[word]);
            var subsets = Morphology.subsets(allOffsets.length);
            subsets.sort((l, r) => r.length - l.length);
            subsetLoop:
            for (var offsetOffsets of subsets) {
                var offsets = [0, 1].concat(offsetOffsets.map((i) => allOffsets[i])).concat([word.length - 1, word.length]);
                var hasRoot = false;
                var hasLeftMarginal = false;
                var hasRightMarginal = false;
                offsets.sort((l, r) => l - r);
                var last = null;
                var w = word;
                for (var i = 1; i < offsets.length; i++) {
                    var m = w.substring(offsets[i - 1], offsets[i]);
                    if (hasRightMarginal && m != '⋉') {
                        continue subsetLoop;
                    }
                    if (hasRoot && !suffixes.has(m)) {
                        continue subsetLoop;
                    }
                    if (!hasRoot && !prefixes.has(m)) {
                        hasRoot = true;
                    }
                    if (marginals.has(m) && prefixes.has(m)) {
                        if (hasLeftMarginal) {
                            continue subsetLoop;
                        }
                        hasLeftMarginal = true;
                    }
                    if (marginals.has(m) && suffixes.has(m)) {
                        if (hasRightMarginal) {
                            continue subsetLoop;
                        }
                        hasRightMarginal = true;
                    }
                    if (last != null) {
                        var key = last + ':' + m;
                        if (!preResult.hasOwnProperty(key)) {
                            preResult[key] = new Set;
                        }
                        preResult[key].add(word);
                    }
                    last = m;
                }
                break;
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

    getAdjacencyMatrix: (bigrams, morphemes, commutations, text, progressCallback) => {
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
        var progress = 0;
        var beginningOfText = text.slice(0, 100000);
        for (var morpheme of relevantMorphemes) {
            progressCallback(progress++, relevantMorphemes.length);
            frequencies[morpheme] = (beginningOfText.match(new RegExp(morpheme, 'g')) || []).length;
        }
        relevantMorphemes.sort((l, r) => frequencies[r] - frequencies[l]);
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
        affixes.delete('');

        var roots = new Set(relevantMorphemes);

        for (var affix of affixes) {
            roots.delete(affix);
        }

        var roots = Array.from(roots);
        var affixes = Array.from(affixes);

        var clusterByMorphemeId = [];
        clusterByMorphemeId.fill(null, 0, Object.values(morphemeMapping).reduce((c1, c2) => Math.max(), 0));
        var morphemeListByCluster = {};

        var signatureByCluster = [];

        var numClusters = 0;

        for (var affix of affixes) {
            signatureByCluster[numClusters] = null;
            clusterByMorphemeId[morphemeMapping[affix]] = numClusters;
            morphemeListByCluster[numClusters] = [affix];
            numClusters++;
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
            signatureByCluster[numClusters] = signature;
            numClusters++;
        }

        var result = [];

        for (var i = 0; i < adjacencyMatrix.length; i++) {
            result.push(clusterByMorphemeId[i]);
        }

        Morphology.firstPassClusterCount = numClusters;

        return [result, signatureByCluster];
    },

    hamming: (a, b) => {
        var result = 0;
        for (var i = 0; i < a.length; i++) {
            if (a[i] != b[i]) {
                result++;
            }
        }
        return result / a.length;
    },

    doSecondPassClustering: (adjacencyMatrix, firstPassClusters, trainingWords, validationWords, morphemeMapping, commutations, signatures, validationPrefixTree, progressCallback) => {
        var affixOperations = [];
        var rootOperations = [];

        signatures = [null].concat(signatures);

        var firstPassClusters = firstPassClusters.map((c) => c + 1);
        var numFirstPassClusters = firstPassClusters.reduce((a, x) => Math.max(a, x), 0) + 1;

        var lb = firstPassClusters[morphemeMapping['⋊']];
        var rb = firstPassClusters[morphemeMapping['⋉']];

        var preliminaryInfo = Morphology.getClusterInfo(numFirstPassClusters, firstPassClusters, adjacencyMatrix, morphemeMapping, commutations);

        preliminaryInfo[0].affix = true;
        preliminaryInfo[0].disabled = true;

        for (var i = 1; i < numFirstPassClusters + 1; i++) {
            for (var j = (i % numFirstPassClusters) + 1; j < numFirstPassClusters; j++) {
                if (i == lb || i == rb || j == lb || j == rb) {
                    continue;
                }
                if (preliminaryInfo[(i % numFirstPassClusters)].affix != preliminaryInfo[j].affix) {
                    continue;
                }
                if (preliminaryInfo[(i % numFirstPassClusters)].affix) {
                    if (i == numFirstPassClusters || preliminaryInfo[(i % numFirstPassClusters)].site == preliminaryInfo[j].site) {
                        affixOperations.push({
                            type: 'merge',
                            first: (i % numFirstPassClusters),
                            second: j,
                        });
                    }
                } else {
                    rootOperations.push({
                        type: 'merge',
                        first: (i % numFirstPassClusters),
                        second: j,
                    });
                }
            }
        }

        var rootUrgency = (op) => {
            return 1 - Morphology.hamming(signatures[op.first], signatures[op.second]);
        };

        rootOperations.sort((l, r) => rootUrgency(r) - rootUrgency(l));

        var originalOperations = affixOperations.concat(rootOperations);

        var numInnerIterations = Math.min(originalOperations.length, Morphology.numClusteringOperations);

        var highScore = Morphology.inventWords(validationPrefixTree, validationWords.size, preliminaryInfo, lb, rb, trainingWords, (p, t) => progressCallback((p / t) / 100, 1));
        var bestClustering = Array.from(firstPassClusters);
        var bestClusterInfo = Morphology.copyClusterInfo(preliminaryInfo);

        var gains = [];

        if (Morphology.phonotacticPenalty > 0) {
            var [phonotacticBigrams, phonotacticTrigrams] = Morphology.learnPhonotactics(
                new Set(
                    Array.from(trainingWords)
                        .concat(Array.from(validationWords)
                        .concat(Morphology.getInventedWords(trainingWords.size, validationPrefixTree, validationWords.size, preliminaryInfo, lb, rb, trainingWords)))));
            var absences = phonotacticBigrams.absences.concat(phonotacticTrigrams.absences).filter((a) => a.length == 2 || a.includes('⋊') || a.includes('⋉'));
        } else {
            var absences = [];
        }

        console.log(`Baseline score: ${(highScore * 100).toFixed(2)}%`);

        var history = [];
        var score = highScore;
        var preResult = [];
        var operations = originalOperations.map((op) => ({type: op.type, first: op.first, second: op.second}));

        for (var i = 0; i < numInnerIterations; i++) {
            var near = Math.floor(numInnerIterations * Math.random())
            var far = Math.floor(operations.length * Math.pow(Math.random(), 2))
        }

        var lastClustering = Array.from(firstPassClusters);
        var index = {};
        var precision = 0;
        for (var j = 0; j < operations.length; j++) {
            var op = operations[j];
            for (var c of [op.first, op.second]) {
                if (!index.hasOwnProperty(c)) {
                    index[c] = new Set;
                }
                index[c].add(j);
            }
        }
        var visited = new Set;

        operationLoop:
        for (var j = 0; j < numInnerIterations; j++) {
            if (Morphology.checkSubsets) {
                progressCallback(j / numInnerIterations + 0.02, 2);
            } else {
                progressCallback(0.99 * (j / numInnerIterations) + 0.01, 1);
            }
            var op = operations[j];
            if (op.first == op.second) {
                continue;
            }
            if (op.first > op.second) {
                [op.first, op.second] = [op.second, op.first];
            }
            if (visited.has([op.first, op.second].join(':'))) {
                continue;
            }
            var newClustering = Array.from(lastClustering);
            for (var k = 0; k < newClustering.length; k++) {
                if (newClustering[k] == op.second) {
                    newClustering[k] = op.first;
                }
            }
            var [renumberedClusters, renumberedNumClusters] = Morphology.renumberClusters(newClustering, newClustering.reduce((a, x) => Math.max(a, x), 0) + 1, morphemeMapping);
            var clusterInfo = Morphology.copyClusterInfo(bestClusterInfo);
            Morphology.updateClusterInfo(clusterInfo, op);
            var newScore = Morphology.inventWords(validationPrefixTree, validationWords.size, clusterInfo, renumberedClusters[morphemeMapping['⋊']], renumberedClusters[morphemeMapping['⋉']], trainingWords, (p, t) => progressCallback(((j + (p / t)) / numInnerIterations) + 0.02, 2));

            visited.add([op.first, op.second].join(':'));


            if (newScore - score >= Morphology.minGain) {
                if (Morphology.phonotacticPenalty > 0) {
                    phonotacticsLoop:
                    for (var invention of Morphology.getInventedWords(validationWords.size * 2, validationPrefixTree, validationWords.size, clusterInfo, renumberedClusters[morphemeMapping['⋊']], renumberedClusters[morphemeMapping['⋉']], trainingWords)) {
                        for (var absence of absences) {
                            if (('⋊' + invention + '⋉').includes(absence)) {
                                //console.log(`${invention} violates *${absence}; a penalty will be incurred.`);
                                newScore *= 1 - (Morphology.phonotacticPenalty / 100);
                                if (newScore - score < Morphology.minGain) {
                                    continue operationLoop;
                                } else {
                                    break phonotacticsLoop;
                                }
                            }
                        }
                    }
                }

                console.log(`High score: ${(newScore * 100).toFixed(2)}% (gain = ${((newScore - score) * 100).toFixed(2)}%); merging clusters {${bestClusterInfo[op.first].morphemes.slice(0, 4).join(', ')}} and {${bestClusterInfo[op.second].morphemes.slice(0, 4).join(', ')}}.`);

                gains.push([newScore - score, j]);
                score = newScore;
                lastClustering = newClustering;
                if (!Morphology.checkSubsets) {
                    bestClustering = newClustering;
                    highScore = newScore;
                }
                bestClusterInfo = Morphology.copyClusterInfo(clusterInfo);

                if (index.hasOwnProperty(op.second)) {
                    for (var k of Array.from(index[op.second])) {
                        if (operations[k] == op) {
                            continue;
                        }
                        if (operations[k].first == op.second) {
                            operations[k].first = op.first;
                            index[op.first].add(k);
                        }
                        if (operations[k].second == op.second) {
                            operations[k].second = op.first;
                            index[op.first].add(k);
                        }
                    }
                }
            }
        }
        if (Morphology.checkSubsets) {
            gains.sort((l, r) => r[0] - l[0]);
            highScore = Morphology.inventWords(validationPrefixTree, validationWords.size, preliminaryInfo, lb, rb, trainingWords);
            bestClustering = Array.from(firstPassClusters);
            var bestHistory = [];

            for (var i = 0; i < gains.length; i++) {
                if (Morphology.subsets(i).map((s) => s.length).reduce((a, x) => a + x, 0) > numInnerIterations) {
                    break;
                }
            }
            gains = gains.slice(0, i);
            var i = 0;

            var subsets = Morphology.subsets(gains.length);
            for (var subset of subsets) {

                var operations = originalOperations.map((op) => ({type: op.type, first: op.first, second: op.second}));
                var clusterInfo = Morphology.copyClusterInfo(preliminaryInfo);

                var history = [];
                progressCallback(1.02 + (i++ / subsets.length) * 0.98, 2);
                var index = {};
                for (var j = 0; j < operations.length; j++) {
                    var op = operations[j];
                    for (var c of [op.first, op.second]) {
                        if (!index.hasOwnProperty(c)) {
                            index[c] = new Set;
                        }
                        index[c].add(j);
                    }
                }
                var lastClustering = Array.from(firstPassClusters);
                var score = Morphology.inventWords(validationPrefixTree, validationWords.size, preliminaryInfo, lb, rb, trainingWords);
                var gainsSubset = subset.map((s) => gains[s]);
                var precision = 0;
                for (var [gain, j] of gainsSubset) {
                    var op = operations[j];
                    var newClustering = Array.from(lastClustering);
                    for (var k = 0; k < newClustering.length; k++) {
                        if (newClustering[k] == op.second) {
                            newClustering[k] = op.first;
                        }
                    }
                    var [renumberedClusters, renumberedNumClusters] = Morphology.renumberClusters(newClustering, newClustering.reduce((a, x) => Math.max(a, x), 0) + 1, morphemeMapping);
                    Morphology.updateClusterInfo(clusterInfo, op);
                    var newScore = Morphology.inventWords(validationPrefixTree, validationWords.size, clusterInfo, renumberedClusters[morphemeMapping['⋊']], renumberedClusters[morphemeMapping['⋉']], trainingWords);
                    history.push([preliminaryInfo[op.first].morphemes[0], preliminaryInfo[op.second].morphemes[0]]);
                    lastClustering = newClustering;
                    score = newScore;
                    if (index.hasOwnProperty(op.second)) {
                        for (var k of Array.from(index[op.second])) {
                            if (operations[k] == op) {
                                continue;
                            }
                            if (operations[k].first == op.second) {
                                operations[k].first = op.first;
                                index[op.first].add(k);
                            }
                            if (operations[k].second == op.second) {
                                operations[k].second = op.first;
                                index[op.first].add(k);
                            }
                        }
                    }
                }
                if (score - highScore >= Morphology.minGain) {
                    console.log(`High score (subset selection): ${(score * 100).toFixed(2)}%; gain = ${((score - highScore) * 100).toFixed(2)}%`);
                    highScore = score;
                    bestClustering = lastClustering;
                    bestHistory = history;
                    bestClusterInfo = clusterInfo;
                }
            }
        }
        var inventions = Morphology.getInventedWords(validationWords.size * 2, validationPrefixTree, validationWords.size, bestClusterInfo, null, null, trainingWords);
        return [highScore, bestClustering, bestClustering.reduce((a, x) => Math.max(a, x), 0) + 1, bestClusterInfo, inventions];
    },

    subsets: (n) => {
        var generate = function* (n) {
            if (n == 0) {
                yield [];
            } else {
                for (var mask of generate(n - 1)) {
                    yield mask.concat([false]);
                    yield mask.concat([true]);
                }
            }
        };
        var result = [];
        for (var mask of generate(n)) {
            var subset = [];
            for (var i = 0; i < n; i++) {
                if (mask[i]) {
                    subset.push(i);
                }
            }
            result.push(subset);
        }
        return result;
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

    generateLayout: (numMorphemes, clusters, numClusters, clusterInfo, width, height, radius, progressCallback) => {
        var result = [];
        var numFailures = 0;
        var epsilon = radius;
        for (var i = 0; i < numMorphemes; i++) {
            progressCallback(i, numMorphemes);
            if (clusters[i] == 0) {
                result.push(null);
                numFailures = 0;
                epsilon = radius;
                continue;
            }
            var candidate = {
                // Ignore cluster 0
                x: Math.floor((width / 2) + (width / 2) * 0.8 * (Math.cos(2 * Math.PI / numClusters * (clusters[i] - 1))) + epsilon * (2 * Math.random() - 1)),
                y: Math.floor((height / 2) + (height / 2) * 0.8 * (Math.sin(2 * Math.PI / numClusters * (clusters[i] - 1))) + epsilon * (2 * Math.random() - 1))
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

    renumberClusters: (clusters, numClusters, morphemeMapping, translation) => {
        if (!translation) {
            translation = {};
        }
        translation[0] = 0;
        var result = [];
        var last = 1;
        for (var i = 1; i < numClusters; i++) {
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

    getRelevantEdges: (adjacencyMatrix, morphemeMapping, clusters, clusterInfo, progressCallback) => {
        var edges = [];
        var count = Object.keys(morphemeMapping).length;
        for (var i = 0; i < count; i++) {
            if (clusterInfo[clusters[i]].disabled) {
                continue;
            }
            progressCallback(i, count);
            for (var j = 0; j < count; j++) {
                if (clusterInfo[clusters[j]].disabled) {
                    continue;
                }
                if (adjacencyMatrix[i][j] > 0) {
                    edges.push([i, j]);
                }
            }
        }
        return edges;
    },

    getAffixSite: (proof) => {
        if (proof.indexOf('_') == 1) {
            return 'leftMarginal';
        } else if (proof.indexOf('_') == proof.length - 2) {
            return 'rightMarginal';
        } else if (proof.indexOf('_') < proof.length / 2) {
            return 'left';
        } else {
            return 'right';
        }
    },

    getClusterInfo: (numClusters, clusters, adjacencyMatrix, morphemeMapping, commutations) => {

        var affixes = new Set;

        var sites = {};

        for (var [set, m1, m2] of commutations) {
            for (var m of [m1, m2]) {
                affixes.add(m);
                for (var proof of set) {
                    sites[m] = Morphology.getAffixSite(proof);
                    break;
                }
            }
        }

        affixes.add('⋊');
        affixes.add('⋉');

        var reverseMorphemeMapping = [];
        for (var morpheme of Object.keys(morphemeMapping)) {
            reverseMorphemeMapping[morphemeMapping[morpheme]] = morpheme;
        }
        var result = [];
        for (var i = 0; i < numClusters; i++) {
            result.push({});
            result[i].id = i;
            result[i].disabled = false;
            result[i].morphemes = [];
            result[i].affix = false;
            result[i].site = null;
            for (var j = 0; j < reverseMorphemeMapping.length; j++) {
                if (clusters[j] == i) {
                    result[i].morphemes.push(reverseMorphemeMapping[j]);
                    if (affixes.has(reverseMorphemeMapping[j])) {
                        result[i].affix = true;
                        result[i].site = sites[result[i].morphemes[0]];
                    }
                }
            }
            result[i].morphemes.sort();
        }
        for (var i = 0; i < numClusters; i++) {
            result[i].successors = new Set;
            for (var j = 0; j < numClusters; j++) {
                if (i == j) {
                    continue;
                }
                for (var m1 of result[i].morphemes) {
                    for (var m2 of result[j].morphemes) {
                        if (adjacencyMatrix[morphemeMapping[m1]][morphemeMapping[m2]] > 0) {
                            result[i].successors.add(result[j]);
                        }
                    }
                }
            }
            result[i].successors = Array.from(result[i].successors);
        }
        return result;
    },

    copyClusterInfo: (clusters) => {
        var instances = {};
        for (var cluster of clusters) {
            instances[cluster.id] = {
                id: cluster.id,
                disabled: cluster.disabled,
                affix: cluster.affix,
                site: cluster.site,
                successors: new Set,
                predecessors: new Set,
                morphemes: Array.from(cluster.morphemes)
            };
        }
        for (var cluster of clusters) {
            for (var relation of ['successors', 'predecessors']) {
                if (!clusters[cluster.id].hasOwnProperty(relation)) {
                    continue;
                }
                for (var neighbor of clusters[cluster.id][relation]) {
                    instances[cluster.id][relation].add(instances[neighbor.id]);
                }
            }
        }
        var result = [];
        for (var i = 0; i < clusters.length; i++) {
            result.push(instances[clusters[i].id]);
        }
        return result;
    },

    updateClusterInfo: function(clusters, operation) {
        if (operation.type == 'merge') {
            var first = clusters.filter((c) => c.id == operation.first)[0];
            var second = clusters.filter((c) => c.id == operation.second)[0];
            for (var cluster of clusters) {
                for (var relation of ['successors', 'predecessors']) {
                    if (cluster[relation].has(second)) {
                        cluster[relation].delete(second);
                        cluster[relation].add(first);
                    }
                }
            }
            for (var morpheme of second.morphemes) {
                first.morphemes.push(morpheme);
            }
            second = null;
            clusters[operation.second] = first;
        }
    },

    getExplainer: (clusterInfo) => {
        var explain = (w, q) => {
            if (w.startsWith('⋊')) {
                w = w.substring(1);
            }
            if (w == '' && q.morphemes.includes('⋉')) {
                return true;
            }
            for (var next of q.successors) {
                if (next.disabled) {
                    continue;
                }
                for (var m of next.morphemes) {
                    if (w.startsWith(m)) {
                        if (explain(w.substring(m.length), next)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        };
        return explain;
    },

    topologicalSort: (clusterInfo) => {
        for (var cluster of clusterInfo) {
            cluster.predecessors = new Set;
        }
        for (var cluster of clusterInfo) {
            for (var successor of cluster.successors) {
                successor.predecessors.add(cluster);
            }
        }
        var withoutPredecessors = new Set;
        var result = [];
        for (var cluster of clusterInfo) {
            if (cluster.predecessors.size == 0) {
                withoutPredecessors.add(cluster);
            }
            cluster.predecessorsCopy = new Set(cluster.predecessors);
        }
        while (withoutPredecessors.size > 0) {
            for (var cluster of withoutPredecessors) {
                result.push(cluster);
                withoutPredecessors.delete(cluster);
                for (var successor of cluster.successors) {
                    successor.predecessorsCopy.delete(cluster);
                    if (successor.predecessorsCopy.size == 0) {
                        withoutPredecessors.add(successor);
                    }
                }
                break;
            }
        }
        for (var cluster of clusterInfo) {
            delete cluster.predecessorsCopy;
        }
        return result;
    },

    inventWords: (validationPrefixTree, numValidationWords, clusterInfo, initial, final, words) => {

        var clusterInfo = Morphology.copyClusterInfo(clusterInfo);

        var initial = clusterInfo.filter((c) => c.morphemes.includes('⋊'))[0];
        var final = clusterInfo.filter((c) => c.morphemes.includes('⋉'))[0];

        for (var cluster of clusterInfo) {
            cluster.numEndingPaths = 0;
            for (var successor of new Set(cluster.successors)) {
                if (
                    (successor.site == 'leftMarginal' && !cluster.morphemes.includes('⋊')) ||
                    (successor.site == 'left' && !(cluster.affix || cluster.morphemes.includes('⋊'))) ||
                    (!(cluster.affix || cluster.morphemes.includes('⋊')) && !(successor.affix || successor.morphemes.includes('⋉'))) ||
                    (cluster.site == 'rightMarginal' && !successor.morphemes.includes('⋉')) ||
                    (cluster.site == 'right' && !(successor.affix || successor.morphemes.includes('⋉')))
                ) {
                    cluster.successors.delete(successor);
                }
            }
        }
        for (var cluster of clusterInfo) {
            cluster.explanations = new Set;
        }
        initial.explanations.add('⋊');
        for (var cluster of Morphology.topologicalSort(clusterInfo)) {
            for (var predecessor of cluster.predecessors) {
                cluster.numEndingPaths += Math.max(predecessor.numEndingPaths, 1) * cluster.morphemes.length;
                for (var explanation of predecessor.explanations) {
                    for (var morpheme of cluster.morphemes) {
                        if (Morphology.searchPrefixTree(validationPrefixTree, explanation + morpheme).length > 0) {
                            cluster.explanations.add(explanation + morpheme);
                        }
                    }
                }
            }
        }
        var total = final.numEndingPaths;
        var explained = final.explanations.size;
        return (1 / (Morphology.precisionMultiplier + Morphology.recallMultiplier)) * (Morphology.precisionMultiplier * explained / total + Morphology.recallMultiplier * explained / numValidationWords);
    },

    getInventedWords: (limit, validationPrefixTree, numValidationWords, clusterInfo, initial, final, words) => {
        var initial = clusterInfo.filter((c) => c.morphemes.includes('⋊'))[0];
        var final = clusterInfo.filter((c) => c.morphemes.includes('⋉'))[0];
        Morphology.inventWords(validationPrefixTree, numValidationWords, clusterInfo, initial, final, words);
        var result = new Set;
        var invent = function* (q, w, n) {
            if (n == 0 && q.morphemes.includes('⋉')) {
                yield w.substring(1, w.length - 1);
            } else if (n > 0) {
                for (var next of q.successors) {
                    if (next.disabled) {
                        continue;
                    }
                    for (var m of next.morphemes) {
                        for (var sub of invent(next, w + m, n - 1)) {
                            yield sub;
                        }
                    }
                }
            }
        };
        result = new Set(final.explanations);
        stateCountLoop:
        for (var numStates = 3; true; numStates++) {
            empty = true;
            for (var word of invent(clusterInfo.filter((c) => c.morphemes.includes('⋊'))[0], '⋊', numStates)) {
                empty = false;
                if (words.has(word)) {
                    continue;
                }
                result.add(word);
                if (result.size >= limit) {
                    break stateCountLoop;
                }
            }
            if (empty) {
                break;
            }
        }
        return Array.from(result);
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
                    if (state.successors.has(clusterInfo[next]) && !clusterInfo[next].disabled) {
                        var subResult = run(suffix.substring(substring.length), clusterInfo[next]);
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
            result[word] = run(word.substring(1), clusterInfo[clusters[morphemeMapping['⋊']]]);
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

    makePrefixTree: (words, progressCallback, prefixesOnly) => {
        if (Morphology.commutations.length > 0 && !prefixesOnly) {
            // FIXME
            return [{}, []];
        }
        var wordArray = Array.from(words);
        var result = {items: []};
        for (var i = 0; i < wordArray.length; i++) {
            progressCallback(i, wordArray.length);
            for (var j = 0; j < (prefixesOnly ? 1 : wordArray[i].length); j++) {
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
    }
};
