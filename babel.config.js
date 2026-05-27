module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      ...(process.env.NODE_ENV === "production"
        ? ["transform-remove-console"]
        : []),
    ],
  };
};