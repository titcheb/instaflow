package com.nexa.iptv;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivityV2 extends Activity {

    private static final int BG = Color.rgb(4, 11, 24);
    private static final int BG_2 = Color.rgb(7, 18, 35);
    private static final int PANEL = Color.rgb(10, 23, 42);
    private static final int PANEL_2 = Color.rgb(14, 31, 53);
    private static final int PANEL_3 = Color.rgb(17, 39, 66);
    private static final int CYAN = Color.rgb(47, 214, 255);
    private static final int CYAN_2 = Color.rgb(76, 179, 255);
    private static final int PURPLE = Color.rgb(120, 88, 255);
    private static final int TEXT = Color.rgb(244, 249, 255);
    private static final int MUTED = Color.rgb(139, 158, 182);
    private static final int MUTED_2 = Color.rgb(97, 119, 145);
    private static final int LIVE = Color.rgb(235, 64, 91);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final List<Channel> allChannels = new ArrayList<>();
    private final List<Channel> visibleChannels = new ArrayList<>();
    private final Map<String, String> categories = new LinkedHashMap<>();

    private SharedPreferences prefs;
    private LinearLayout categoryRow;
    private ListView channelList;
    private ChannelAdapter adapter;
    private EditText searchBox;
    private TextView heroStatus;
    private TextView countText;
    private ProgressBar progress;

    private String selectedCategory = "ALL";
    private String server = "";
    private String username = "";
    private String password = "";
    private Set<String> favorites = new HashSet<>();

    private boolean compact;
    private boolean veryCompact;
    private int sidePad;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Configuration cfg = getResources().getConfiguration();
        compact = cfg.screenWidthDp <= 400 || cfg.screenHeightDp <= 760;
        veryCompact = cfg.screenWidthDp <= 360 || cfg.screenHeightDp <= 680;
        sidePad = dp(compact ? 14 : 18);

        prefs = getSharedPreferences("nexa", MODE_PRIVATE);
        server = prefs.getString("server", "");
        username = prefs.getString("username", "");
        password = prefs.getString("password", "");
        favorites = new HashSet<>(prefs.getStringSet("favorites", Collections.emptySet()));

        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            getWindow().setNavigationBarDividerColor(BG);
        }

        buildUi();

        if (server.isEmpty() || username.isEmpty() || password.isEmpty()) {
            showLoginDialog(false);
        } else {
            loadXtream();
        }
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackground(gradient(BG, BG_2, 0));

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(sidePad, dp(8), sidePad, dp(6));
        root.addView(page, new FrameLayout.LayoutParams(-1, -1));

        // Android 15+ enforces edge-to-edge for target 35+. Apply the real
        // status/navigation bar insets so content never sits behind system UI.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top = insets.getSystemWindowInsetTop();
            int bottom = insets.getSystemWindowInsetBottom();
            page.setPadding(sidePad, top + dp(compact ? 5 : 8), sidePad, bottom + dp(4));
            return insets;
        });

        buildHeader(page);
        buildHero(page);
        buildCategories(page);
        buildSearch(page);
        buildChannelList(page);
        buildBottomNav(page);

        setContentView(root);
        root.requestApplyInsets();
        rebuildCategories();
    }

    private void buildHeader(LinearLayout page) {
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(0, 0, 0, dp(compact ? 9 : 12));

        TextView logo = new TextView(this);
        logo.setText("▶");
        logo.setTextSize(compact ? 20 : 23);
        logo.setTextColor(Color.WHITE);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(gradient(PURPLE, CYAN, dp(13)));
        int logoSize = dp(compact ? 42 : 48);
        header.addView(logo, new LinearLayout.LayoutParams(logoSize, logoSize));

        LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.VERTICAL);
        brand.setPadding(dp(compact ? 10 : 12), 0, dp(6), 0);

        TextView name = text("Nexa IPTV Player", compact ? 18 : 20, TEXT, true);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        brand.addView(name);

        if (!veryCompact) {
            TextView sub = text("Your TV. Your way.", compact ? 10 : 12, MUTED, false);
            brand.addView(sub);
        }

        header.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));

        String addLabel = getResources().getConfiguration().screenWidthDp < 375 ? "+" : "+ Playlist";
        Button add = button(addLabel, false);
        add.setTextSize(compact ? 12 : 13);
        add.setMinWidth(0);
        add.setMinimumWidth(0);
        add.setOnClickListener(v -> showLoginDialog(true));
        int addWidth = "+".equals(addLabel) ? dp(46) : dp(compact ? 88 : 100);
        header.addView(add, new LinearLayout.LayoutParams(addWidth, dp(compact ? 40 : 44)));

        page.addView(header, new LinearLayout.LayoutParams(-1, -2));
    }

    private void buildHero(LinearLayout page) {
        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        int hp = dp(compact ? 15 : 18);
        hero.setPadding(hp, hp, hp, hp);
        hero.setBackground(gradient(Color.rgb(13, 34, 62), Color.rgb(18, 48, 76), dp(compact ? 18 : 22)));

        LinearLayout liveLine = new LinearLayout(this);
        liveLine.setGravity(Gravity.CENTER_VERTICAL);
        TextView badge = text(" LIVE ", compact ? 10 : 11, Color.WHITE, true);
        badge.setGravity(Gravity.CENTER);
        badge.setBackground(solid(LIVE, dp(7)));
        liveLine.addView(badge, new LinearLayout.LayoutParams(-2, dp(compact ? 24 : 26)));

        TextView liveName = text("  Nexa Live TV", compact ? 12 : 13, CYAN, true);
        liveLine.addView(liveName);
        hero.addView(liveLine);

        TextView title = text("Everything you watch,\nin one place.", veryCompact ? 22 : (compact ? 24 : 28), TEXT, true);
        title.setLineSpacing(0, 0.96f);
        title.setPadding(0, dp(compact ? 9 : 12), 0, dp(4));
        title.setMaxLines(2);
        hero.addView(title);

        heroStatus = text("Connect your Xtream playlist to start.", compact ? 11 : 13, MUTED, false);
        heroStatus.setSingleLine(true);
        heroStatus.setEllipsize(TextUtils.TruncateAt.END);
        hero.addView(heroStatus);

        Button watch = button("▶  Watch Live", true);
        watch.setTextSize(compact ? 12 : 13);
        LinearLayout.LayoutParams lpWatch = new LinearLayout.LayoutParams(dp(compact ? 142 : 156), dp(compact ? 42 : 48));
        lpWatch.topMargin = dp(compact ? 10 : 14);
        hero.addView(watch, lpWatch);
        watch.setOnClickListener(v -> {
            if (!visibleChannels.isEmpty()) openChannel(visibleChannels.get(0));
            else if (allChannels.isEmpty()) showLoginDialog(false);
        });

        page.addView(hero, new LinearLayout.LayoutParams(-1, -2));
    }

    private void buildCategories(LinearLayout page) {
        LinearLayout section = new LinearLayout(this);
        section.setGravity(Gravity.CENTER_VERTICAL);
        section.setPadding(0, dp(compact ? 13 : 18), 0, dp(compact ? 6 : 8));

        TextView sectionTitle = text("Live TV Categories", compact ? 16 : 18, TEXT, true);
        section.addView(sectionTitle, new LinearLayout.LayoutParams(0, -2, 1));

        countText = text("0 channels", compact ? 10 : 12, MUTED, false);
        countText.setSingleLine(true);
        section.addView(countText);
        page.addView(section);

        HorizontalScrollView cats = new HorizontalScrollView(this);
        cats.setHorizontalScrollBarEnabled(false);
        cats.setFillViewport(false);
        cats.setOverScrollMode(View.OVER_SCROLL_NEVER);

        categoryRow = new LinearLayout(this);
        categoryRow.setOrientation(LinearLayout.HORIZONTAL);
        categoryRow.setPadding(0, 0, dp(6), 0);
        cats.addView(categoryRow, new HorizontalScrollView.LayoutParams(-2, -1));
        page.addView(cats, new LinearLayout.LayoutParams(-1, dp(compact ? 42 : 48)));
    }

    private void buildSearch(LinearLayout page) {
        searchBox = new EditText(this);
        searchBox.setSingleLine(true);
        searchBox.setHint("Search channels...");
        searchBox.setHintTextColor(MUTED_2);
        searchBox.setTextColor(TEXT);
        searchBox.setTextSize(compact ? 13 : 15);
        searchBox.setPadding(dp(15), 0, dp(15), 0);
        searchBox.setBackground(solid(PANEL, dp(compact ? 13 : 14)));

        LinearLayout.LayoutParams lpSearch = new LinearLayout.LayoutParams(-1, dp(compact ? 46 : 50));
        lpSearch.topMargin = dp(compact ? 7 : 8);
        lpSearch.bottomMargin = dp(compact ? 7 : 8);
        page.addView(searchBox, lpSearch);

        searchBox.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { filterChannels(); }
            @Override public void afterTextChanged(Editable s) {}
        });
    }

    private void buildChannelList(LinearLayout page) {
        FrameLayout listWrap = new FrameLayout(this);

        channelList = new ListView(this);
        channelList.setDivider(null);
        channelList.setDividerHeight(dp(compact ? 7 : 8));
        channelList.setCacheColorHint(Color.TRANSPARENT);
        channelList.setSelector(android.R.color.transparent);
        channelList.setClipToPadding(false);
        channelList.setPadding(0, 0, 0, dp(2));

        adapter = new ChannelAdapter(this);
        channelList.setAdapter(adapter);
        channelList.setOnItemClickListener((parent, view, position, id) -> openChannel(visibleChannels.get(position)));
        channelList.setOnItemLongClickListener((parent, view, position, id) -> {
            toggleFavorite(visibleChannels.get(position));
            return true;
        });
        listWrap.addView(channelList, new FrameLayout.LayoutParams(-1, -1));

        progress = new ProgressBar(this);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(dp(46), dp(46), Gravity.CENTER);
        listWrap.addView(progress, pp);

        page.addView(listWrap, new LinearLayout.LayoutParams(-1, 0, 1));
    }

    private void buildBottomNav(LinearLayout page) {
        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(2), dp(compact ? 5 : 7), dp(2), dp(2));
        nav.setBackground(solid(Color.rgb(7, 18, 33), dp(compact ? 15 : 18)));

        nav.addView(navItem("⌂", "Home", true), new LinearLayout.LayoutParams(0, dp(compact ? 48 : 56), 1));
        nav.addView(navItem("▣", "Live", false), new LinearLayout.LayoutParams(0, dp(compact ? 48 : 56), 1));

        View fav = navItem("♥", "Favorites", false);
        fav.setOnClickListener(v -> {
            selectedCategory = "FAVORITES";
            rebuildCategories();
            filterChannels();
        });
        nav.addView(fav, new LinearLayout.LayoutParams(0, dp(compact ? 48 : 56), 1));

        nav.addView(navItem("⌕", "Search", false), new LinearLayout.LayoutParams(0, dp(compact ? 48 : 56), 1));

        View settings = navItem("⚙", "Settings", false);
        settings.setOnClickListener(v -> showLoginDialog(true));
        nav.addView(settings, new LinearLayout.LayoutParams(0, dp(compact ? 48 : 56), 1));

        LinearLayout.LayoutParams navParams = new LinearLayout.LayoutParams(-1, dp(compact ? 54 : 64));
        navParams.topMargin = dp(4);
        page.addView(nav, navParams);
    }

    private View navItem(String icon, String label, boolean active) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);

        TextView i = text(icon, compact ? 17 : 19, active ? CYAN : MUTED_2, false);
        i.setGravity(Gravity.CENTER);
        TextView l = text(label, compact ? 8 : 9, active ? CYAN : MUTED_2, active);
        l.setGravity(Gravity.CENTER);
        l.setSingleLine(true);
        box.addView(i);
        box.addView(l);

        box.setOnClickListener(v -> {
            if ("Search".equals(label)) searchBox.requestFocus();
            if ("Home".equals(label) || "Live".equals(label)) {
                selectedCategory = "ALL";
                rebuildCategories();
                filterChannels();
            }
        });
        return box;
    }

    private void showLoginDialog(boolean editable) {
        Dialog d = new Dialog(this);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        int p = dp(compact ? 18 : 22);
        wrap.setPadding(p, p, p, p);
        wrap.setBackground(gradient(PANEL, Color.rgb(13, 31, 54), dp(22)));

        TextView t = text("Connect Xtream", compact ? 21 : 24, TEXT, true);
        wrap.addView(t);

        TextView desc = text("Add the server details supplied by your IPTV provider.", compact ? 11 : 13, MUTED, false);
        desc.setPadding(0, dp(5), 0, dp(compact ? 14 : 18));
        wrap.addView(desc);

        EditText serverField = field("Server URL", server, false);
        EditText userField = field("Username", username, false);
        EditText passField = field("Password", password, true);
        wrap.addView(serverField, fieldParams());
        wrap.addView(userField, fieldParams());
        wrap.addView(passField, fieldParams());

        Button connect = button("Connect & Load", true);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, dp(compact ? 48 : 52));
        bp.topMargin = dp(6);
        wrap.addView(connect, bp);

        Button clear = button("Clear saved login", false);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, dp(compact ? 44 : 48));
        cp.topMargin = dp(7);
        wrap.addView(clear, cp);

        connect.setOnClickListener(v -> {
            String s = serverField.getText().toString().trim();
            String u = userField.getText().toString().trim();
            String p1 = passField.getText().toString();
            if (s.isEmpty() || u.isEmpty() || p1.isEmpty()) {
                toast("Fill Server URL, Username and Password");
                return;
            }
            server = normalizeServer(s);
            username = u;
            password = p1;
            prefs.edit().putString("server", server).putString("username", username).putString("password", password).apply();
            d.dismiss();
            loadXtream();
        });

        clear.setOnClickListener(v -> {
            prefs.edit().remove("server").remove("username").remove("password").apply();
            server = username = password = "";
            allChannels.clear();
            categories.clear();
            filterChannels();
            heroStatus.setText("Connect your Xtream playlist to start.");
            d.dismiss();
            toast("Saved login cleared");
        });

        d.setContentView(wrap);
        d.setCancelable(editable || !server.isEmpty());
        d.show();

        Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawableResource(android.R.color.transparent);
            WindowManager.LayoutParams a = w.getAttributes();
            int width = getResources().getDisplayMetrics().widthPixels;
            a.width = Math.min((int) (width * 0.92f), dp(520));
            w.setAttributes(a);
        }
    }

    private EditText field(String hint, String value, boolean passwordField) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(MUTED_2);
        e.setTextColor(TEXT);
        e.setText(value);
        e.setTextSize(compact ? 13 : 15);
        e.setSingleLine(true);
        e.setPadding(dp(14), 0, dp(14), 0);
        e.setBackground(solid(Color.rgb(6, 16, 31), dp(12)));
        if (passwordField) e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        return e;
    }

    private LinearLayout.LayoutParams fieldParams() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(compact ? 48 : 52));
        p.bottomMargin = dp(8);
        return p;
    }

    private void loadXtream() {
        progress.setVisibility(View.VISIBLE);
        heroStatus.setText("Connecting to provider...");

        executor.execute(() -> {
            try {
                String q = "username=" + enc(username) + "&password=" + enc(password);
                JSONObject auth = new JSONObject(get(server + "/player_api.php?" + q));
                JSONObject ui = auth.optJSONObject("user_info");
                if (ui == null || !("1".equals(ui.optString("auth")) || ui.optInt("auth", 0) == 1)) {
                    throw new Exception("Login rejected by provider");
                }

                JSONArray catJson = new JSONArray(get(server + "/player_api.php?" + q + "&action=get_live_categories"));
                JSONArray streams = new JSONArray(get(server + "/player_api.php?" + q + "&action=get_live_streams"));

                Map<String, String> catMap = new HashMap<>();
                LinkedHashMap<String, String> loadedCategories = new LinkedHashMap<>();
                for (int i = 0; i < catJson.length(); i++) {
                    JSONObject c = catJson.optJSONObject(i);
                    if (c == null) continue;
                    String id = c.optString("category_id", "");
                    String name = c.optString("category_name", "Other");
                    if (!id.isEmpty()) {
                        catMap.put(id, name);
                        loadedCategories.put(id, name);
                    }
                }

                List<Channel> loaded = new ArrayList<>();
                for (int i = 0; i < streams.length(); i++) {
                    JSONObject o = streams.optJSONObject(i);
                    if (o == null) continue;
                    String id = String.valueOf(o.optInt("stream_id", 0));
                    if ("0".equals(id)) continue;

                    String catId = o.optString("category_id", "");
                    String catName = catMap.getOrDefault(catId, "Other");
                    String direct = o.optString("direct_source", "").trim();
                    String url = direct.startsWith("http")
                            ? direct
                            : server + "/live/" + Uri.encode(username) + "/" + Uri.encode(password) + "/" + id + ".ts";

                    loaded.add(new Channel(
                            id,
                            o.optString("name", "Channel " + id),
                            catId,
                            catName,
                            o.optString("stream_icon", ""),
                            url
                    ));
                }

                loaded.sort(Comparator.comparing(c -> c.name.toLowerCase(Locale.ROOT)));

                runOnUiThread(() -> {
                    allChannels.clear();
                    allChannels.addAll(loaded);
                    categories.clear();
                    categories.putAll(loadedCategories);
                    selectedCategory = "ALL";
                    progress.setVisibility(View.GONE);
                    heroStatus.setText("Connected • " + loaded.size() + " live channels");
                    rebuildCategories();
                    filterChannels();
                    toast("Connected successfully");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    progress.setVisibility(View.GONE);
                    heroStatus.setText("Connection failed");
                    toast(e.getMessage() == null ? "Could not load playlist" : e.getMessage());
                    showLoginDialog(true);
                });
            }
        });
    }

    private void rebuildCategories() {
        if (categoryRow == null) return;
        categoryRow.removeAllViews();
        addCategoryChip("ALL", "All");
        addCategoryChip("FAVORITES", "♥ Favorites");
        for (Map.Entry<String, String> e : categories.entrySet()) {
            addCategoryChip(e.getKey(), e.getValue());
        }
    }

    private void addCategoryChip(String id, String label) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextSize(compact ? 10 : 12);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setSingleLine(true);
        b.setEllipsize(TextUtils.TruncateAt.END);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setMaxWidth(dp(compact ? 150 : 180));

        boolean active = id.equals(selectedCategory);
        b.setTextColor(active ? Color.rgb(3, 20, 28) : TEXT);
        b.setBackground(active ? solid(CYAN, dp(11)) : solid(PANEL, dp(11)));
        b.setPadding(dp(compact ? 12 : 14), 0, dp(compact ? 12 : 14), 0);

        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(compact ? 36 : 40));
        p.rightMargin = dp(7);
        categoryRow.addView(b, p);

        b.setOnClickListener(v -> {
            selectedCategory = id;
            rebuildCategories();
            filterChannels();
        });
    }

    private void filterChannels() {
        String q = searchBox == null ? "" : searchBox.getText().toString().trim().toLowerCase(Locale.ROOT);
        visibleChannels.clear();

        for (Channel c : allChannels) {
            boolean categoryOk;
            if ("ALL".equals(selectedCategory)) categoryOk = true;
            else if ("FAVORITES".equals(selectedCategory)) categoryOk = favorites.contains(c.id);
            else categoryOk = selectedCategory.equals(c.categoryId);

            boolean searchOk = q.isEmpty()
                    || c.name.toLowerCase(Locale.ROOT).contains(q)
                    || c.categoryName.toLowerCase(Locale.ROOT).contains(q);

            if (categoryOk && searchOk) visibleChannels.add(c);
        }

        if (adapter != null) adapter.notifyDataSetChanged();
        if (countText != null) countText.setText(visibleChannels.size() + " channels");
    }

    private void toggleFavorite(Channel ch) {
        if (favorites.contains(ch.id)) {
            favorites.remove(ch.id);
            toast("Removed from favorites");
        } else {
            favorites.add(ch.id);
            toast("Added to favorites");
        }
        prefs.edit().putStringSet("favorites", new HashSet<>(favorites)).apply();
        adapter.notifyDataSetChanged();
    }

    private void openChannel(Channel ch) {
        Intent i = new Intent(this, PlayerActivity.class);
        i.putExtra("name", ch.name);
        i.putExtra("url", ch.url);
        i.putExtra("category", ch.categoryName);
        startActivity(i);
    }

    private String get(String urlString) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(urlString).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(25000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "NexaIPTV/1.1 Android");
        c.setRequestProperty("Accept", "application/json,*/*");

        int code = c.getResponseCode();
        InputStream in = code >= 200 && code < 400 ? c.getInputStream() : c.getErrorStream();
        if (in == null) throw new Exception("Provider HTTP " + code);

        BufferedReader r = new BufferedReader(new InputStreamReader(in));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) out.append(line);
        r.close();
        c.disconnect();

        if (code < 200 || code >= 400) throw new Exception("Provider HTTP " + code);
        return out.toString();
    }

    private String normalizeServer(String s) {
        s = s.trim();
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(sp);
        v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private Button button(String value, boolean primary) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(value);
        b.setTextSize(compact ? 12 : 13);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(primary ? Color.rgb(4, 21, 29) : TEXT);
        b.setBackground(primary ? gradient(CYAN, CYAN_2, dp(13)) : solid(PANEL_2, dp(13)));
        b.setPadding(dp(12), 0, dp(12), 0);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        return b;
    }

    private GradientDrawable solid(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }

    private GradientDrawable gradient(int c1, int c2, int radius) {
        GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{c1, c2});
        d.setCornerRadius(radius);
        return d;
    }

    private int dp(int n) {
        return (int) (n * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private static class Channel {
        final String id;
        final String name;
        final String categoryId;
        final String categoryName;
        final String icon;
        final String url;

        Channel(String id, String name, String categoryId, String categoryName, String icon, String url) {
            this.id = id;
            this.name = name;
            this.categoryId = categoryId;
            this.categoryName = categoryName;
            this.icon = icon;
            this.url = url;
        }
    }

    private class ChannelAdapter extends BaseAdapter {
        private final Context context;
        ChannelAdapter(Context context) { this.context = context; }

        @Override public int getCount() { return visibleChannels.size(); }
        @Override public Object getItem(int position) { return visibleChannels.get(position); }
        @Override public long getItemId(int position) { return position; }

        @Override
        public View getView(int position, View convertView, ViewGroup parent) {
            Channel ch = visibleChannels.get(position);
            LinearLayout row;
            TextView logo;
            TextView title;
            TextView meta;
            TextView live;

            if (convertView == null) {
                row = new LinearLayout(context);
                row.setGravity(Gravity.CENTER_VERTICAL);
                row.setPadding(dp(compact ? 10 : 12), dp(compact ? 8 : 10), dp(compact ? 10 : 12), dp(compact ? 8 : 10));
                row.setBackground(gradient(PANEL, Color.rgb(12, 29, 50), dp(compact ? 14 : 16)));

                int logoSize = dp(compact ? 45 : 52);
                logo = text("TV", compact ? 14 : 16, CYAN, true);
                logo.setGravity(Gravity.CENTER);
                logo.setTag("logo");
                logo.setSingleLine(true);
                logo.setBackground(solid(Color.rgb(6, 19, 36), dp(12)));
                row.addView(logo, new LinearLayout.LayoutParams(logoSize, logoSize));

                LinearLayout info = new LinearLayout(context);
                info.setOrientation(LinearLayout.VERTICAL);
                info.setPadding(dp(compact ? 10 : 12), 0, dp(5), 0);

                title = text("", compact ? 13 : 15, TEXT, true);
                title.setTag("title");
                title.setSingleLine(true);
                title.setEllipsize(TextUtils.TruncateAt.END);

                meta = text("", compact ? 10 : 11, MUTED, false);
                meta.setTag("meta");
                meta.setSingleLine(true);
                meta.setEllipsize(TextUtils.TruncateAt.END);

                info.addView(title);
                info.addView(meta);
                row.addView(info, new LinearLayout.LayoutParams(0, -2, 1));

                live = text("LIVE", compact ? 8 : 9, Color.WHITE, true);
                live.setTag("live");
                live.setGravity(Gravity.CENTER);
                live.setPadding(dp(compact ? 7 : 9), dp(4), dp(compact ? 7 : 9), dp(4));
                live.setBackground(solid(Color.rgb(22, 104, 132), dp(7)));
                row.addView(live);
            } else {
                row = (LinearLayout) convertView;
                logo = (TextView) row.findViewWithTag("logo");
                title = (TextView) row.findViewWithTag("title");
                meta = (TextView) row.findViewWithTag("meta");
                live = (TextView) row.findViewWithTag("live");
            }

            String trimmed = ch.name == null ? "" : ch.name.trim();
            String initials = trimmed.isEmpty()
                    ? "TV"
                    : trimmed.substring(0, Math.min(2, trimmed.length())).toUpperCase(Locale.ROOT);

            logo.setText(initials);
            title.setText((favorites.contains(ch.id) ? "♥  " : "") + ch.name);
            meta.setText(ch.categoryName + "  •  Tap to watch");
            return row;
        }
    }
}
