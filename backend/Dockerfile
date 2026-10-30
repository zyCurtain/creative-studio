FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY settings.xml /root/.m2/settings.xml
COPY src src
RUN --mount=type=cache,target=/root/.m2/repository mvn -B -ntp verify
FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* && useradd -m studio && mkdir /data && chown studio:studio /data
WORKDIR /app
COPY --from=build /app/target/studio-1.0.0.jar app.jar
USER studio
EXPOSE 8080
ENTRYPOINT ["java", "-Djava.awt.headless=true", "-jar", "app.jar"]

