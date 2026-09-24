package com.nexa.iptv;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

public class PlayerActivity extends Activity {

    private ExoPlayer player;
    private PlayerView playerView;
    private TextView errorText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.setStatusBarColor(Color.BLACK);
        w.setNavigationBarColor(Color.BLACK);
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String name = getIntent().getStringExtra("name");
        String url = getIntent().getStringExtra("url");
        String category = getIntent().getStringExtra("category");

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setControllerAutoShow(true);
        root.addView(playerView, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setPadding(dp(18), dp(14), dp(18), dp(14));
        GradientDrawable topBg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.argb(210, 4, 13, 26), Color.argb(0, 4, 13, 26)});
        top.setBackground(topBg);

        TextView back = new TextView(this);
        back.setText("‹  Back");
        back.setTextColor(Color.rgb(49, 215, 255));
        back.setTextSize(15);
        back.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        back.setPadding(0, 0, 0, dp(8));
        back.setOnClickListener(v -> finish());
        top.addView(back);

        TextView title = new TextView(this);
        title.setText(name == null ? "Nexa IPTV" : name);
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        top.addView(title);

        TextView meta = new TextView(this);
        meta.setText((category == null ? "Live TV" : category) + "  •  LIVE");
        meta.setTextColor(Color.rgb(145, 162, 184));
        meta.setTextSize(12);
        top.addView(meta);

        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        root.addView(top, tp);

        errorText = new TextView(this);
        errorText.setTextColor(Color.WHITE);
        errorText.setTextSize(15);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(dp(24), dp(18), dp(24), dp(18));
        errorText.setVisibility(View.GONE);
        GradientDrawable err = new GradientDrawable();
        err.setColor(Color.argb(225, 35, 18, 32));
        err.setCornerRadius(dp(16));
        errorText.setBackground(err);
        FrameLayout.LayoutParams ep = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        ep.leftMargin = dp(24);
        ep.rightMargin = dp(24);
        root.addView(errorText, ep);

        setContentView(root);

        if (url == null || url.trim().isEmpty()) {
            showError("This channel has no playback URL.");
        } else {
            startPlayer(url);
        }
    }

    private void startPlayer(String url) {
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent("NexaIPTV/1.0 Android")
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(30000);

        DefaultMediaSourceFactory mediaSources = new DefaultMediaSourceFactory(this)
                .setDataSourceFactory(http);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSources)
                .build();

        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                showError("Playback failed\n" + readable(error));
            }
        });

        MediaItem item = MediaItem.fromUri(Uri.parse(url));
        player.setMediaItem(item);
        player.prepare();
        player.setPlayWhenReady(true);
    }

    private String readable(PlaybackException e) {
        String m = e.getMessage();
        if (m == null || m.trim().isEmpty()) return "The provider rejected the stream or the format is unsupported.";
        if (m.length() > 150) m = m.substring(0, 150) + "…";
        return m;
    }

    private void showError(String message) {
        errorText.setText(message + "\n\nTry another channel or verify the provider connection.");
        errorText.setVisibility(View.VISIBLE);
    }

    @Override
    protected void onStop() {
        super.onStop();
        releasePlayer();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (player == null) {
            String url = getIntent().getStringExtra("url");
            if (url != null && !url.isEmpty()) startPlayer(url);
        }
    }

    private void releasePlayer() {
        if (player != null) {
            player.release();
            player = null;
        }
        if (playerView != null) playerView.setPlayer(null);
    }

    private int dp(int n) {
        return (int) (n * getResources().getDisplayMetrics().density + 0.5f);
    }
}
