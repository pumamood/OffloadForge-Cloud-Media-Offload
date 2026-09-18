jQuery(document).ready(function($) {

    // Escape a string for safe insertion via .html()
    function escapeHtml(str) {
        return $('<span>').text(str == null ? '' : str).html();
    }

    // Show/hide provider fields based on selection
    $('#provider').on('change', function() {
        var provider = $(this).val();
        if (provider) {
            $('.provider-field').addClass('active');
        } else {
            $('.provider-field').removeClass('active');
        }
    }).trigger('change');
    
    // Save settings
    $('#g33ki-settings-form').on('submit', function(e) {
        e.preventDefault();
        var $form = $(this);
        var $submit = $form.find('input[type="submit"]');
        var $status = $('#connection-status');
        
        $submit.prop('disabled', true).val('Saving...');
        $status.hide();
        
        $.ajax({
            url: g33ki_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'g33ki_save_settings',
                nonce: g33ki_ajax.nonce,
                settings: {
                    provider: $('#provider').val(),
                    access_key: $('#access_key').val(),
                    secret_key: $('#secret_key').val(),
                    bucket: $('#bucket').val(),
                    region: $('#region').val(),
                    cdn_url: $('#cdn_url').val(),
                    path_prefix: $('#path_prefix').val(),
                    remove_local_files: $('#remove_local_files').is(':checked') ? 1 : 0
                }
            },
            success: function(response) {
                $status.removeClass('success error');
                if (response.success) {
                    $status.addClass('success').html('<strong>' + escapeHtml(response.data.message) + '</strong>');
                } else {
                    $status.addClass('error').html('<strong>Error:</strong> ' + escapeHtml(response.data.message));
                }
                $status.show();
            },
            error: function() {
                $status.removeClass('success error').addClass('error');
                $status.html('<strong>Error:</strong> Failed to save settings.').show();
            },
            complete: function() {
                $submit.prop('disabled', false).val('💾 Save Settings');
            }
        });
    });
    
    // Test connection
    $('#test-connection').on('click', function() {
        var $button = $(this);
        var $status = $('#connection-status');
        
        var provider = $('#provider').val();
        if (!provider) {
            alert('Please select a storage provider first.');
            return;
        }
        
        var credentials = {
            provider: provider,
            access_key: $('#access_key').val(),
            secret_key: $('#secret_key').val(),
            bucket: $('#bucket').val(),
            region: $('#region').val()
        };
        
        $button.prop('disabled', true).text('Testing...');
        $status.hide();
        
        $.ajax({
            url: g33ki_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'g33ki_test_connection',
                nonce: g33ki_ajax.nonce,
                provider: provider,
                credentials: credentials
            },
            success: function(response) {
                $status.removeClass('success error');
                if (response.success) {
                    $status.addClass('success').html('<strong>Success!</strong> ' + escapeHtml(response.data.message));
                } else {
                    $status.addClass('error').html('<strong>Error:</strong> ' + escapeHtml(response.data.message));
                }
                $status.show();
            },
            error: function() {
                $status.removeClass('success error').addClass('error');
                $status.html('<strong>Error:</strong> Failed to test connection.').show();
            },
            complete: function() {
                $button.prop('disabled', false).text('Test Connection');
            }
        });
    });
    
    // Bulk restore functionality
    if ($('#start-bulk-restore').length) {

        // Reset UI state on page load
        $('#bulk-restore-complete').hide().find('.notice').hide();
        $('#bulk-restore-progress').hide();
        $('#bulk-restore-errors').hide();

        // Get restore count on page load
        $.ajax({
            url: g33ki_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'g33ki_get_restore_count',
                nonce: g33ki_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    $('#restore-count').text(response.data.count);
                    if (response.data.count === 0) {
                        $('#restore-count').text('0 (All files are already stored locally!)');
                        $('#start-bulk-restore').prop('disabled', true);
                    }
                }
            }
        });

        // Start bulk restore
        $('#start-bulk-restore').on('click', function() {
            var $button = $(this);
            var totalCount = parseInt($('#restore-count').text());

            if (isNaN(totalCount) || totalCount === 0) {
                return;
            }

            if (!confirm('This will download ' + totalCount + ' files from cloud storage. Continue?')) {
                return;
            }

            $button.prop('disabled', true).addClass('disabled');
            $('#bulk-restore-progress').show();
            $('#bulk-restore-errors').hide();
            $('#restore-error-list').empty();

            var processed = 0;
            var errors = [];
            var retryCount = 0;
            var maxRetries = 5;

            function restoreBatch() {
                $.ajax({
                    url: g33ki_ajax.ajax_url,
                    type: 'POST',
                    timeout: 120000,
                    data: {
                        action: 'g33ki_bulk_restore',
                        nonce: g33ki_ajax.nonce,
                        offset: 0
                    },
                    success: function(response) {
                        retryCount = 0;
                        if (response.success) {
                            processed += response.data.processed;

                            if (response.data.errors.length > 0) {
                                errors = errors.concat(response.data.errors);
                            }

                            var percentage = totalCount > 0 ? Math.min(Math.round((processed / totalCount) * 100), 100) : 100;
                            $('#restore-progress-bar').css('width', percentage + '%');
                            $('#restore-progress-percentage').text(percentage + '%');
                            $('#restore-progress-text').text('Restored ' + processed + ' of ' + totalCount + ' files');

                            if (response.data.complete) {
                                $('#bulk-restore-complete').show().find('.notice').show();
                                $('#restore-progress-text').text('Complete! Restored ' + processed + ' files.');

                                if (errors.length > 0) {
                                    $('#bulk-restore-errors').show();
                                    errors.forEach(function(error) {
                                        $('#restore-error-list').append('<li><strong>' + error.title + '</strong>: ' + error.error + '</li>');
                                    });
                                }

                                $('#restore-count').text('0 (All files are already stored locally!)');
                            } else {
                                restoreBatch();
                            }
                        } else {
                            alert('Error: ' + response.data.message);
                            $button.prop('disabled', false).removeClass('disabled');
                        }
                    },
                    error: function() {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            $('#restore-progress-text').text('Connection lost. Retrying (' + retryCount + '/' + maxRetries + ')...');
                            setTimeout(restoreBatch, 3000);
                        } else {
                            $('#restore-progress-text').text('Stopped at ' + processed + ' of ' + totalCount + ' files. Click button to resume.');
                            $button.prop('disabled', false).removeClass('disabled');
                        }
                    }
                });
            }

            restoreBatch();
        });
    }

    // Bulk offload functionality
    if ($('#start-bulk-offload').length) {

        // Reset UI state on page load
        $('#bulk-offload-complete').hide().find('.notice').hide();
        $('#bulk-offload-progress').hide();
        $('#bulk-offload-errors').hide();
        
        // Get media count on page load
        $.ajax({
            url: g33ki_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'g33ki_get_media_count',
                nonce: g33ki_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    $('#media-count').text(response.data.count);
                    if (response.data.count === 0) {
                        $('#media-count').text('0 (All media files are already offloaded!)');
                        $('#start-bulk-offload').prop('disabled', true);
                    }
                }
            }
        });
        
        // Start bulk offload
        $('#start-bulk-offload').on('click', function() {
            var $button = $(this);
            var totalCount = parseInt($('#media-count').text());

            if (isNaN(totalCount) || totalCount === 0) {
                return;
            }

            if (!confirm('This will offload ' + totalCount + ' media files. Continue?')) {
                return;
            }

            $button.prop('disabled', true).addClass('disabled');
            $('#bulk-offload-progress').show();
            $('#bulk-offload-errors').hide();
            $('#error-list').empty();

            var processed = 0;
            var errors = [];
            var retryCount = 0;
            var maxRetries = 5;

            function processBatch() {
                $.ajax({
                    url: g33ki_ajax.ajax_url,
                    type: 'POST',
                    timeout: 120000,
                    data: {
                        action: 'g33ki_bulk_offload',
                        nonce: g33ki_ajax.nonce,
                        offset: 0
                    },
                    success: function(response) {
                        retryCount = 0;
                        if (response.success) {
                            processed += response.data.processed;

                            if (response.data.errors.length > 0) {
                                errors = errors.concat(response.data.errors);
                            }

                            var percentage = totalCount > 0 ? Math.min(Math.round((processed / totalCount) * 100), 100) : 100;
                            $('#progress-bar').css('width', percentage + '%');
                            $('#progress-percentage').text(percentage + '%');
                            $('#progress-text').text('Processed ' + processed + ' of ' + totalCount + ' files');

                            if (response.data.complete) {
                                $('#bulk-offload-complete').show().find('.notice').show();
                                $('#progress-text').text('Complete! Processed ' + processed + ' files.');

                                if (errors.length > 0) {
                                    $('#bulk-offload-errors').show();
                                    errors.forEach(function(error) {
                                        $('#error-list').append('<li><strong>' + error.title + '</strong>: ' + error.error + '</li>');
                                    });
                                }

                                $('#media-count').text('0 (All media files are now offloaded!)');
                            } else {
                                processBatch();
                            }
                        } else {
                            alert('Error: ' + response.data.message);
                            $button.prop('disabled', false).removeClass('disabled');
                        }
                    },
                    error: function() {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            $('#progress-text').text('Connection lost. Retrying (' + retryCount + '/' + maxRetries + ')...');
                            setTimeout(processBatch, 3000);
                        } else {
                            $('#progress-text').text('Stopped at ' + processed + ' of ' + totalCount + ' files. Click button to resume.');
                            $button.prop('disabled', false).removeClass('disabled');
                        }
                    }
                });
            }

            processBatch();
        });
    }

    // Fix Permissions functionality
    if ($('#start-scan').length) {

        // Reset UI state on page load
        $('#fix-scan-progress').hide();
        $('#fix-scan-results').hide();
        $('#fix-progress').hide();
        $('#fix-complete').hide();
        $('#fix-errors').hide();
        $('#start-fix').hide();

        var brokenFiles = [];

        // Scan for broken files
        $('#start-scan').on('click', function() {
            var $button = $(this);
            $button.prop('disabled', true).text('Scanning...');
            $('#fix-scan-progress').show();
            $('#fix-scan-results').hide();
            $('#start-fix').hide();
            $('#fix-complete').hide();
            $('#fix-errors').hide();
            brokenFiles = [];
            $('#broken-files-list').empty();

            var offset = 0;
            var retryCount = 0;
            var maxRetries = 5;

            function scanBatch() {
                $.ajax({
                    url: g33ki_ajax.ajax_url,
                    type: 'POST',
                    timeout: 120000,
                    data: {
                        action: 'g33ki_scan_permissions',
                        nonce: g33ki_ajax.nonce,
                        offset: offset
                    },
                    success: function(response) {
                        retryCount = 0;
                        if (response.success) {
                            offset = response.data.scanned;

                            if (response.data.broken.length > 0) {
                                brokenFiles = brokenFiles.concat(response.data.broken);
                                response.data.broken.forEach(function(file) {
                                    $('#broken-files-list').append(
                                        '<tr><td>' + file.id + '</td><td>' + file.title + '</td><td><code>' + file.error + '</code></td></tr>'
                                    );
                                });
                            }

                            var percentage = response.data.total > 0 ? Math.min(Math.round((offset / response.data.total) * 100), 100) : 100;
                            $('#scan-progress-bar').css('width', percentage + '%');
                            $('#scan-progress-percentage').text(percentage + '%');
                            $('#scan-progress-text').text('Scanned ' + offset + ' of ' + response.data.total + ' files (' + brokenFiles.length + ' broken)');

                            if (response.data.complete) {
                                $('#fix-scan-results').show();
                                if (brokenFiles.length === 0) {
                                    $('#scan-results-ok').show();
                                    $('#scan-results-broken').hide();
                                } else {
                                    $('#scan-results-ok').hide();
                                    $('#scan-results-broken').show().find('.notice').show();
                                    $('#broken-count-text').text(brokenFiles.length + ' file(s) have permission issues');
                                    $('#start-fix').show();
                                }
                                $button.prop('disabled', false).text('Scan Files');
                            } else {
                                scanBatch();
                            }
                        } else {
                            alert('Error: ' + response.data.message);
                            $button.prop('disabled', false).text('Scan Files');
                        }
                    },
                    error: function() {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            $('#scan-progress-text').text('Connection lost. Retrying (' + retryCount + '/' + maxRetries + ')...');
                            setTimeout(scanBatch, 3000);
                        } else {
                            $button.prop('disabled', false).text('Scan Files');
                        }
                    }
                });
            }

            scanBatch();
        });

        // Fix broken permission files
        $('#start-fix').on('click', function() {
            var $button = $(this);

            if (brokenFiles.length === 0) {
                return;
            }

            if (!confirm('This will fix permissions for ' + brokenFiles.length + ' file(s). Continue?')) {
                return;
            }

            $button.prop('disabled', true);
            $('#fix-progress').show();
            $('#fix-complete').hide();
            $('#fix-errors').hide();
            $('#fix-error-list').empty();

            var totalToFix = brokenFiles.length;
            var fixedTotal = 0;
            var fixErrors = [];
            var batchSize = 5;
            var batchIndex = 0;

            function fixBatch() {
                var batch = brokenFiles.slice(batchIndex, batchIndex + batchSize);
                if (batch.length === 0) {
                    // Done
                    $('#fix-complete').show();
                    $('#fix-complete-text').text('Fixed ' + fixedTotal + ' of ' + totalToFix + ' files.');
                    if (fixErrors.length > 0) {
                        $('#fix-errors').show();
                        fixErrors.forEach(function(err) {
                            $('#fix-error-list').append('<li>ID ' + err.id + ': ' + err.error + '</li>');
                        });
                    }
                    $button.hide();
                    return;
                }

                var ids = batch.map(function(f) { return f.id; });

                $.ajax({
                    url: g33ki_ajax.ajax_url,
                    type: 'POST',
                    timeout: 120000,
                    data: {
                        action: 'g33ki_fix_permissions',
                        nonce: g33ki_ajax.nonce,
                        ids: ids
                    },
                    success: function(response) {
                        if (response.success) {
                            fixedTotal += response.data.fixed;
                            if (response.data.errors.length > 0) {
                                fixErrors = fixErrors.concat(response.data.errors);
                            }

                            batchIndex += batchSize;
                            var percentage = Math.min(Math.round((batchIndex / totalToFix) * 100), 100);
                            $('#fix-progress-bar').css('width', percentage + '%');
                            $('#fix-progress-text').text('Fixed ' + fixedTotal + ' of ' + totalToFix + ' files...');

                            fixBatch();
                        } else {
                            alert('Error: ' + response.data.message);
                            $button.prop('disabled', false);
                        }
                    },
                    error: function() {
                        alert('Connection error during fix.');
                        $button.prop('disabled', false);
                    }
                });
            }

            fixBatch();
        });
    }

    // Fix Missing Thumbnails functionality
    if ($('#start-thumb-scan').length) {

        // Reset UI state on page load
        $('#thumb-scan-progress').hide();
        $('#thumb-scan-results').hide();
        $('#thumb-fix-progress').hide();
        $('#thumb-fix-complete').hide();
        $('#thumb-fix-errors').hide();
        $('#start-thumb-fix').hide();

        var brokenThumbs = [];

        // Scan for missing thumbnails
        $('#start-thumb-scan').on('click', function() {
            var $button = $(this);
            $button.prop('disabled', true).text('Scanning...');
            $('#thumb-scan-progress').show();
            $('#thumb-scan-results').hide();
            $('#start-thumb-fix').hide();
            $('#thumb-fix-complete').hide();
            $('#thumb-fix-errors').hide();
            brokenThumbs = [];
            $('#thumb-broken-files-list').empty();

            var offset = 0;
            var retryCount = 0;
            var maxRetries = 5;

            function scanThumbBatch() {
                $.ajax({
                    url: g33ki_ajax.ajax_url,
                    type: 'POST',
                    timeout: 120000,
                    data: {
                        action: 'g33ki_scan_thumbnails',
                        nonce: g33ki_ajax.nonce,
                        offset: offset
                    },
                    success: function(response) {
                        retryCount = 0;
                        if (response.success) {
                            offset = response.data.scanned;

                            if (response.data.broken.length > 0) {
                                brokenThumbs = brokenThumbs.concat(response.data.broken);
                                response.data.broken.forEach(function(file) {
                                    $('#thumb-broken-files-list').append(
                                        '<tr><td>' + file.id + '</td><td>' + file.title + '</td><td><code>' + file.missing_sizes.join(', ') + '</code></td></tr>'
                                    );
                                });
                            }

                            var percentage = response.data.total > 0 ? Math.min(Math.round((offset / response.data.total) * 100), 100) : 100;
                            $('#thumb-scan-progress-bar').css('width', percentage + '%');
                            $('#thumb-scan-progress-percentage').text(percentage + '%');
                            $('#thumb-scan-progress-text').text('Scanned ' + offset + ' of ' + response.data.total + ' attachments (' + brokenThumbs.length + ' with missing thumbnails)');

                            if (response.data.complete) {
                                $('#thumb-scan-results').show();
                                if (brokenThumbs.length === 0) {
                                    $('#thumb-scan-results-ok').show();
                                    $('#thumb-scan-results-broken').hide();
                                } else {
                                    $('#thumb-scan-results-ok').hide();
                                    $('#thumb-scan-results-broken').show().find('.notice').show();
                                    $('#thumb-broken-count-text').text(brokenThumbs.length + ' attachment(s) have missing thumbnail URLs');
                                    $('#start-thumb-fix').show();
                                }
                                $button.prop('disabled', false).text('Scan Thumbnails');
                            } else {
                                scanThumbBatch();
                            }
                        } else {
                            alert('Error: ' + response.data.message);
                            $button.prop('disabled', false).text('Scan Thumbnails');
                        }
                    },
                    error: function() {
                        retryCount++;
                        if (retryCount <= maxRetries) {
                            $('#thumb-scan-progress-text').text('Connection lost. Retrying (' + retryCount + '/' + maxRetries + ')...');
                            setTimeout(scanThumbBatch, 3000);
                        } else {
                            $button.prop('disabled', false).text('Scan Thumbnails');
                        }
                    }
                });
            }

            scanThumbBatch();
        });

        // Fix missing thumbnails
        $('#start-thumb-fix').on('click', function() {
            var $button = $(this);

            if (brokenThumbs.length === 0) {
                return;
            }

            if (!confirm('This will upload missing thumbnails for ' + brokenThumbs.length + ' attachment(s). Continue?')) {
                return;
            }

            $button.prop('disabled', true);
            $('#thumb-fix-progress').show();
            $('#thumb-fix-complete').hide();
            $('#thumb-fix-errors').hide();
            $('#thumb-fix-error-list').empty();

            var totalToFix = brokenThumbs.length;
            var fixedTotal = 0;
            var fixErrors = [];
            var batchSize = 3;
            var batchIndex = 0;

            function fixThumbBatch() {
                var batch = brokenThumbs.slice(batchIndex, batchIndex + batchSize);
                if (batch.length === 0) {
                    // Done
                    $('#thumb-fix-complete').show();
                    $('#thumb-fix-complete-text').text('Fixed ' + fixedTotal + ' of ' + totalToFix + ' attachments.');
                    if (fixErrors.length > 0) {
                        $('#thumb-fix-errors').show();
                        fixErrors.forEach(function(err) {
                            $('#thumb-fix-error-list').append('<li>ID ' + err.id + ': ' + err.error + '</li>');
                        });
                    }
                    $button.hide();
                    return;
                }

                var ids = batch.map(function(f) { return f.id; });

                $.ajax({
                    url: g33ki_ajax.ajax_url,
                    type: 'POST',
                    timeout: 120000,
                    data: {
                        action: 'g33ki_fix_thumbnails',
                        nonce: g33ki_ajax.nonce,
                        ids: ids
                    },
                    success: function(response) {
                        if (response.success) {
                            fixedTotal += response.data.fixed;
                            if (response.data.errors.length > 0) {
                                fixErrors = fixErrors.concat(response.data.errors);
                            }

                            batchIndex += batchSize;
                            var percentage = Math.min(Math.round((batchIndex / totalToFix) * 100), 100);
                            $('#thumb-fix-progress-bar').css('width', percentage + '%');
                            $('#thumb-fix-progress-text').text('Fixed ' + fixedTotal + ' of ' + totalToFix + ' attachments...');

                            fixThumbBatch();
                        } else {
                            alert('Error: ' + response.data.message);
                            $button.prop('disabled', false);
                        }
                    },
                    error: function() {
                        alert('Connection error during fix.');
                        $button.prop('disabled', false);
                    }
                });
            }

            fixThumbBatch();
        });
    }

    // Fix URLs functionality
    if ($('#start-url-scan').length) {
        var mismatchedItems = [];

        function truncateUrl(url, maxLen) {
            maxLen = maxLen || 60;
            if (url.length <= maxLen) return url;
            return url.substring(0, 30) + '...' + url.substring(url.length - 27);
        }

        // Scan URLs
        $('#start-url-scan').on('click', function() {
            var $btn = $(this);
            $btn.prop('disabled', true);
            $('#start-url-fix').hide();
            $('#fix-scan-results').hide();
            $('#fix-complete').hide();
            $('#fix-errors').hide();
            $('#fix-scan-progress').show();
            $('#mismatched-files-list').empty();
            mismatchedItems = [];

            function scanBatch(offset) {
                $.post(g33ki_ajax.ajax_url, {
                    action: 'g33ki_scan_urls',
                    nonce: g33ki_ajax.nonce,
                    offset: offset
                }, function(response) {
                    if (!response.success) {
                        alert(response.data.message || 'Scan failed');
                        $btn.prop('disabled', false);
                        return;
                    }

                    var data = response.data;

                    // Collect mismatched items
                    if (data.mismatched && data.mismatched.length) {
                        $.each(data.mismatched, function(i, item) {
                            mismatchedItems.push(item);
                            $('#mismatched-files-list').append(
                                '<tr>' +
                                    '<td>' + item.id + '</td>' +
                                    '<td>' + $('<span>').text(item.title).html() + '</td>' +
                                    '<td title="' + $('<span>').text(item.old_url).html() + '">' + $('<span>').text(truncateUrl(item.old_url)).html() + '</td>' +
                                    '<td title="' + $('<span>').text(item.expected_url).html() + '">' + $('<span>').text(truncateUrl(item.expected_url)).html() + '</td>' +
                                '</tr>'
                            );
                        });
                    }

                    // Update progress
                    var pct = data.total > 0 ? Math.round((data.scanned / data.total) * 100) : 100;
                    $('#scan-progress-bar').css('width', pct + '%');
                    $('#scan-progress-percentage').text(pct + '%');
                    $('#scan-progress-text').text(
                        g33ki_ajax.i18n.scanned + ' ' + data.scanned + ' / ' + data.total
                    );

                    if (data.complete) {
                        $('#fix-scan-progress').hide();
                        $('#fix-scan-results').show();

                        if (mismatchedItems.length === 0) {
                            $('#scan-results-ok').show();
                            $('#scan-results-mismatched').hide();
                        } else {
                            $('#scan-results-ok').hide();
                            $('#scan-results-mismatched').show().find('.notice').show();
                            $('#mismatched-count-text').text(
                                mismatchedItems.length + ' ' + g33ki_ajax.i18n.file_mismatched_found
                            );
                            $('#start-url-fix').show();
                        }

                        $btn.prop('disabled', false);
                    } else {
                        scanBatch(data.scanned);
                    }
                }).fail(function() {
                    alert(g33ki_ajax.i18n.ajax_failed);
                    $btn.prop('disabled', false);
                });
            }

            scanBatch(0);
        });

        // Fix URLs
        $('#start-url-fix').on('click', function() {
            var $btn = $(this);
            $btn.prop('disabled', true);
            $('#start-url-scan').prop('disabled', true);
            $('#fix-progress').show();
            $('#fix-complete').hide();
            $('#fix-errors').hide();
            $('#fix-error-list').empty();

            var allIds = mismatchedItems.map(function(item) { return item.id; });
            var totalToFix = allIds.length;
            var totalFixed = 0;
            var allErrors = [];

            function fixBatch(ids) {
                var batch = ids.slice(0, 20);
                var remaining = ids.slice(20);

                $.post(g33ki_ajax.ajax_url, {
                    action: 'g33ki_fix_urls',
                    nonce: g33ki_ajax.nonce,
                    ids: batch
                }, function(response) {
                    if (!response.success) {
                        alert(response.data.message || 'Fix failed');
                        $btn.prop('disabled', false);
                        $('#start-url-scan').prop('disabled', false);
                        return;
                    }

                    var data = response.data;
                    totalFixed += data.fixed;

                    if (data.errors && data.errors.length) {
                        allErrors = allErrors.concat(data.errors);
                    }

                    var pct = Math.round((totalFixed / totalToFix) * 100);
                    $('#fix-progress-bar').css('width', pct + '%');
                    $('#fix-progress-text').text(
                        g33ki_ajax.i18n.fixed + ' ' + totalFixed + ' / ' + totalToFix
                    );

                    if (remaining.length > 0) {
                        fixBatch(remaining);
                    } else {
                        $('#fix-progress').hide();
                        $('#fix-complete').show();
                        $('#fix-complete-text').text(
                            totalFixed + ' ' + g33ki_ajax.i18n.file_updated
                        );

                        if (allErrors.length > 0) {
                            $('#fix-errors').show();
                            $.each(allErrors, function(i, err) {
                                $('#fix-error-list').append(
                                    '<li>' + g33ki_ajax.i18n.attachment + ' #' + err.id + ': ' + $('<span>').text(err.error).html() + '</li>'
                                );
                            });
                        }

                        $btn.hide();
                        $('#start-url-scan').prop('disabled', false);
                    }
                }).fail(function() {
                    alert(g33ki_ajax.i18n.ajax_failed);
                    $btn.prop('disabled', false);
                    $('#start-url-scan').prop('disabled', false);
                });
            }

            fixBatch(allIds);
        });
    }
});

